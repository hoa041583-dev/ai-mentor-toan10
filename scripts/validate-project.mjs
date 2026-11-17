import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const htmlFiles = ["index.html", "mentor.html"];
let checkedBlocks = 0;
const mentorHtml = fs.readFileSync("mentor.html", "utf8");
const gradeExamples = new Set([...mentorHtml.matchAll(/grade:"(\d+)"/g)].map(match => Number(match[1])));
for (let grade = 1; grade <= 12; grade++) {
  if (!gradeExamples.has(grade)) throw new Error("mentor.html is missing the sample example for grade " + grade + ".");
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-mentor-check-"));
try {
  for (const file of htmlFiles) {
    if (!fs.existsSync(file)) throw new Error("Missing required HTML file: " + file);
    const html = fs.readFileSync(file, "utf8");
    for (const tag of ["</head>", "</body>", "</html>"]) {
      if (!html.includes(tag)) throw new Error(file + " is missing " + tag);
    }
    if (!html.includes("</style>")) throw new Error(file + " is missing </style>.");
    const blocks = [];
    let cursor = 0;
    while (true) {
      const start = html.indexOf("<script", cursor);
      if (start < 0) break;
      const openEnd = html.indexOf(">", start);
      const close = html.indexOf("</script>", openEnd + 1);
      if (openEnd < 0 || close < 0) throw new Error("Malformed script tag in " + file + ".");
      blocks.push(html.slice(openEnd + 1, close));
      cursor = close + 9;
    }
    if (blocks.length < 1) throw new Error("No script blocks found in " + file + ".");
    for (let i = 0; i < blocks.length; i++) {
      const jsFile = path.join(dir, file.replace(/[^a-z0-9]/gi, "_") + "-" + i + ".js");
      fs.writeFileSync(jsFile, blocks[i], "utf8");
      const check = spawnSync(process.execPath, ["--check", jsFile], { encoding: "utf8" });
      if (check.status !== 0) {
        process.stderr.write(check.stderr || check.stdout || "JavaScript syntax error");
        throw new Error("Script block " + (i + 1) + " failed in " + file + ".");
      }
      checkedBlocks++;
    }
  }
  const workerCheck = spawnSync(process.execPath, ["--check", "worker/index.js"], { encoding: "utf8" });
  if (workerCheck.status !== 0) {
    process.stderr.write(workerCheck.stderr || workerCheck.stdout || "Worker syntax error");
    throw new Error("worker/index.js failed syntax validation.");
  }
  console.log("Validated " + checkedBlocks + " inline JavaScript blocks across " + htmlFiles.length + " HTML files and worker/index.js.");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
