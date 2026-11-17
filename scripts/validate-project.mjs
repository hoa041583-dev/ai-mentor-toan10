import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const html = fs.readFileSync("index.html", "utf8");
for (const tag of ["</head>", "</style>", "</body>", "</html>"]) {
  if (!html.includes(tag)) throw new Error("index.html is missing " + tag);
}
const blocks = [...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)];
if (blocks.length < 1) throw new Error("No inline script blocks found.");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-mentor-check-"));
try {
  for (let i = 0; i < blocks.length; i++) {
    const file = path.join(dir, "inline-" + i + ".js");
    fs.writeFileSync(file, blocks[i][1], "utf8");
    const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (check.status !== 0) {
      process.stderr.write(check.stderr || check.stdout || "JavaScript syntax error");
      throw new Error("Inline script " + (i + 1) + " failed syntax validation.");
    }
  }
  console.log("Validated " + blocks.length + " inline JavaScript blocks in index.html.");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
