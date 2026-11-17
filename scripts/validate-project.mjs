import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const html = fs.readFileSync("index.html", "utf8");
for (const tag of ["</head>", "</style>", "</body>", "</html>"]) {
  if (!html.includes(tag)) throw new Error("index.html is missing " + tag);
}
const blocks = [];
let cursor = 0;
while (true) {
  const start = html.indexOf("<script", cursor);
  if (start < 0) break;
  const openEnd = html.indexOf(">", start);
  const close = html.indexOf("</script>", openEnd + 1);
  if (openEnd < 0 || close < 0) throw new Error("Malformed script tag in index.html.");
  blocks.push(html.slice(openEnd + 1, close));
  cursor = close + 9;
}
if (blocks.length < 1) throw new Error("No script blocks found.");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-mentor-check-"));
try {
  for (let i = 0; i < blocks.length; i++) {
    const file = path.join(dir, "inline-" + i + ".js");
    fs.writeFileSync(file, blocks[i], "utf8");
    const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (check.status !== 0) {
      process.stderr.write(check.stderr || check.stdout || "JavaScript syntax error");
      throw new Error("Script block " + (i + 1) + " failed syntax validation.");
    }
  }
  console.log("Validated " + blocks.length + " JavaScript script blocks in index.html.");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
