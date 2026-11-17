const ALLOWED_ORIGIN = "https://hoa041583-dev.github.io";
const MAX_BODY_BYTES = 6_500_000;
const MAX_IMAGE_CHARS = 5_300_000;
const MAX_MESSAGE_CHARS = 12_000;
const MAX_HISTORY_ITEMS = 12;
const MAX_HISTORY_CHARS = 24_000;
const MAX_OUTPUT_TOKENS = 1_900;

// Best-effort per-isolate guard. For a public launch, also add a Cloudflare
// WAF rate-limit rule for POST /api/tutor.
const buckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const old = buckets.get(ip) || { start: now, count: 0 };
  if (now - old.start > 60_000) { old.start = now; old.count = 0; }
  old.count += 1;
  buckets.set(ip, old);
  if (buckets.size > 2_000) {
    for (const [key, value] of buckets) if (now - value.start > 120_000) buckets.delete(key);
  }
  return old.count > 12;
}

function responseJson(data, status, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff"
  };
  return new Response(JSON.stringify(data), { status, headers });
}

function allowedOrigin(origin) {
  return origin === ALLOWED_ORIGIN || origin === "http://localhost:3000" || origin === "http://127.0.0.1:5500";
}

function extractText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text.trim();
  const chunks = [];
  for (const item of payload.output || []) {
    for (const part of item.content || []) {
      if (part.type === "output_text" && typeof part.text === "string") chunks.push(part.text);
    }
  }
  return chunks.join("\n").trim();
}

function blockedMathReply() {
  return "Mình là AI Mentor, gia sư Toán dành cho học sinh. Mình chỉ hỗ trợ nội dung học tập phù hợp lứa tuổi và các chủ đề Toán. Bạn hãy gửi một bài Toán hoặc câu hỏi về kiến thức cần học nhé.";
}

async function moderate(text, apiKey) {
  if (!text) return false;
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input: text.slice(0, MAX_MESSAGE_CHARS) })
  });
  if (!response.ok) throw new Error("Không thể kiểm tra an toàn nội dung.");
  const data = await response.json();
  return Boolean(data.results && data.results[0] && data.results[0].flagged);
}

function tutorInstructions(body) {
  const grade = String(body.grade || body.profile?.grade || "auto");
  const mode = String(body.mode || "guide");
  const level = String(body.profile?.level || "auto");
  const selfLevel = String(body.profile?.selfLevel || "average");
  const goal = String(body.profile?.goal || "understand");
  return [
    "Bạn là AI Mentor, một gia sư Toán chuyên biệt có tên và phong cách sư phạm riêng. Bạn phục vụ chương trình Toán từ lớp 1 đến lớp 12, ưu tiên tiếng Việt và bối cảnh chương trình phổ thông Việt Nam. Bạn là gia sư học tập, không phải chatbot đa mục đích.",
    "Phạm vi kiến thức: số học, phép tính, phân số, số thập phân, đo lường, hình học, đại số, phương trình và bất phương trình, hàm số và đồ thị, lượng giác, vectơ, tọa độ, tổ hợp, xác suất, thống kê, giới hạn, đạo hàm, tích phân và các chuyên đề phổ thông tương ứng lớp 1–12.",
    "Khối lớp người học đã chọn: " + grade + ". Nếu là auto, hãy suy ra lớp gần đúng từ dạng kiến thức; nếu không đủ căn cứ, hỏi lại. Không tự ý dùng kiến thức lớp cao để giải bài của học sinh nhỏ tuổi.",
    "Cách dạy theo độ tuổi: lớp 1–5 dùng ngôn ngữ đơn giản, ví dụ trực quan, số nhỏ, tránh ký hiệu đại số không cần thiết; lớp 6–9 giải thích quy tắc và biến đổi cơ bản; lớp 10–12 dùng định nghĩa, điều kiện, công thức và lập luận chuẩn chương trình. Không hạ thấp người học.",
    "Chế độ yêu cầu: " + mode + ". Với hint, chỉ đưa gợi ý vừa đủ và dừng để học sinh thử; với solve, trình bày lời giải đầy đủ; với check, chỉ ra dòng/bước đầu tiên sai và vì sao; với similar, tạo một bài tương tự cùng mức độ rồi chờ học sinh làm; với guide, dẫn dắt kiểu Socratic.",
    "Mức độ mong muốn: " + level + ". Tự đánh giá của học sinh: " + selfLevel + ". Mục tiêu: " + goal + ". Chuyên đề đang chọn: " + String(body.selectedTopic || "tự nhận diện") + ".",
    "Quy trình giải bài: (1) chép lại đề/dữ kiện đã đọc; (2) xác định yêu cầu và điều kiện; (3) nêu phương pháp/công thức; (4) giải từng bước, mỗi bước giải thích lý do; (5) kiểm tra bằng cách thế lại, ước lượng hoặc phương pháp độc lập; (6) kết luận rõ ràng và nêu lỗi hay gặp nếu phù hợp.",
    "Cấu trúc lời giải mặc định: Tóm tắt đề và yêu cầu → Kiến thức cần dùng → Lời giải từng bước → Kiểm tra kết quả → Kết luận. Dùng công thức và ký hiệu đúng cấp lớp; mỗi phép biến đổi quan trọng phải có lời giải thích ngắn.",
    "Khi giải bài (đặc biệt ở chế độ solve hoặc guide), hãy thêm một ví dụ minh họa ngắn có số liệu khác nhưng cùng phương pháp, kèm đáp án hoặc 2–3 bước giải. Với bài quá đơn giản ở lớp 1–5, có thể minh họa bằng đồ vật, nhóm chấm hoặc trục số thay vì ký hiệu trừu tượng. Không để ví dụ phụ làm câu trả lời quá dài; nếu người học chỉ yêu cầu hint thì chưa tiết lộ lời giải hay ví dụ đã giải.",
    "Nếu đề có nhiều cách giải, ưu tiên cách phù hợp khối lớp và nói rõ vì sao chọn cách đó. Phân biệt dữ kiện đề bài, giả định và kết quả suy ra; không bịa tên bài, số trang hoặc nội dung sách giáo khoa.";
    "Nếu nhận ảnh: đọc chính xác chữ, số, dấu, biểu đồ và hình vẽ. Không nhìn rõ thì nói phần nào chưa rõ và yêu cầu ảnh chụp thẳng, đủ sáng; tuyệt đối không đoán dữ kiện. Mô tả đồ thị/hình học dựa trên cái nhìn thấy, phân biệt dữ kiện trong ảnh với suy luận.",
    "Tính toán phải cẩn thận. Kiểm tra dấu, phép tính, miền xác định, đơn vị, điều kiện nghiệm và kết luận. Nếu bài có nhiều cách, ưu tiên cách phù hợp khối lớp. Không bịa quy định sách giáo khoa; nếu chương trình/sách khác nhau, hỏi tên bộ sách hoặc mục học.",
    "Chỉ trả lời trong phạm vi học tập phù hợp lứa tuổi. Nếu người dùng chuyển sang chủ đề nhạy cảm hoặc không liên quan đến Toán, lịch sự từ chối ngắn gọn và mời quay lại bài Toán. Không yêu cầu hoặc nhắc người học cung cấp họ tên, địa chỉ, số điện thoại, tên trường, tài khoản hay dữ liệu cá nhân.",
    "Không khẳng định mọi lời giải luôn đúng. Nếu đề mơ hồ, thiếu hình/dữ kiện hoặc có thể có nhiều cách hiểu, nêu rõ giả định hoặc hỏi lại. Không giả vờ đã dùng công cụ tính toán bên ngoài."
  ].join("\n\n");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!allowedOrigin(origin)) return new Response("Origin không được phép.", { status: 403 });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
      }});
    }
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return responseJson({ ok: true, service: "AI Mentor K-12 API", model: env.MODEL || "gpt-6.1-terra" }, 200, origin);
    }
    if (request.method !== "POST" || url.pathname !== "/api/tutor") {
      return responseJson({ error: "Không tìm thấy endpoint." }, 404, origin);
    }
    if (!env.OPENAI_API_KEY) return responseJson({ error: "Máy chủ AI chưa được cấu hình khóa truy cập." }, 503, origin);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(ip)) return responseJson({ error: "Bạn gửi câu hỏi hơi nhanh. Hãy đợi một phút rồi thử lại nhé." }, 429, origin);
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > MAX_BODY_BYTES) return responseJson({ error: "Nội dung gửi lên quá lớn. Hãy giảm kích thước ảnh." }, 413, origin);
    let body;
    try { body = await request.json(); } catch { return responseJson({ error: "Dữ liệu gửi lên không hợp lệ." }, 400, origin); }
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
    if (!message && !imageDataUrl) return responseJson({ error: "Hãy nhập câu hỏi hoặc gửi ảnh đề bài." }, 400, origin);
    if (message.length > MAX_MESSAGE_CHARS) return responseJson({ error: "Câu hỏi quá dài. Hãy chia thành các phần nhỏ hơn." }, 413, origin);
    if (imageDataUrl) {
      if (imageDataUrl.length > MAX_IMAGE_CHARS || !/^data:image\/(jpeg|png|webp);base64,/i.test(imageDataUrl)) {
        return responseJson({ error: "Ảnh không đúng định dạng hoặc có dung lượng quá lớn." }, 400, origin);
      }
    }
    const history = Array.isArray(body.messages) ? body.messages.slice(-MAX_HISTORY_ITEMS) : [];
    let historyChars = 0;
    const safeHistory = [];
    for (const item of history) {
      if (!item || !["user","assistant"].includes(item.role) || typeof item.content !== "string") continue;
      const content = item.content.slice(0, 3_000);
      historyChars += content.length;
      if (historyChars <= MAX_HISTORY_CHARS) safeHistory.push({ role: item.role, content });
    }
    try {
      // Text moderation and model instructions keep this school tutor age-appropriate.
      if (await moderate(message || "Học sinh gửi ảnh đề Toán.", env.OPENAI_API_KEY)) {
        return responseJson({ reply: blockedMathReply() }, 200, origin);
      }
      const currentContent = [{ type: "input_text", text: message || "Hãy đọc ảnh đề Toán, chép lại dữ kiện rồi hướng dẫn từng bước." }];
      if (imageDataUrl) currentContent.push({ type: "input_image", image_url: imageDataUrl, detail: "high" });
      const input = safeHistory.concat([{ role: "user", content: currentContent }]);
      const modelResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: env.MODEL || "gpt-6.1-terra",
          instructions: tutorInstructions(body),
          input,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          store: false
        })
      });
      const modelData = await modelResponse.json().catch(() => ({}));
      if (!modelResponse.ok) {
        return responseJson({ error: "AI Mentor chưa thể trả lời lúc này. Mã lỗi từ dịch vụ: " + modelResponse.status }, 502, origin);
      }
      const reply = extractText(modelData);
      if (!reply) return responseJson({ error: "AI chưa trả về lời giải văn bản. Hãy gửi lại câu hỏi nhé." }, 502, origin);
      if (await moderate(reply, env.OPENAI_API_KEY)) {
        return responseJson({ reply: "Mình chưa thể hiển thị câu trả lời này. Hãy đặt lại câu hỏi trong phạm vi học Toán phù hợp lứa tuổi nhé." }, 200, origin);
      }
      return responseJson({ reply, model: env.MODEL || "gpt-6.1-terra" }, 200, origin);
    } catch (error) {
      return responseJson({ error: "Kết nối AI gặp sự cố. Vui lòng thử lại sau." }, 502, origin);
    }
  }
};
