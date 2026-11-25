// Test: app.js must not contain $("...#") - $ is getElementById, not querySelector
// Also: app.js must not contain || "folder" fallback (depth 3+ is always "chapter")
import fs from "fs";
import path from "path";

const appPath = path.resolve("public/app.js");
const content = fs.readFileSync(appPath, "utf8");

const lines = content.split("\n");
let hasError = false;

// Regex to match $("...#") or $('...#') - $ is (id) => document.getElementById(id)
// so $("#editor") is wrong, should be $("editor")
const badPattern = /\$\(\s*['"]#/;

// Regex to match || "folder" or || 'folder' fallback
const folderFallbackPattern = /\|\|\s*['"]folder['"]/;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (badPattern.test(line)) {
    console.error(`FAIL: app.js line ${i + 1} contains $("...#") which returns null:`);
    console.error(`  ${line.trim()}`);
    hasError = true;
  }
  if (folderFallbackPattern.test(line)) {
    console.error(`FAIL: app.js line ${i + 1} contains || "folder" fallback (depth 3+ is always "chapter"):`);
    console.error(`  ${line.trim()}`);
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
}

console.log("OK: app.js does not contain $(\"#...\") or || \"folder\" fallback");