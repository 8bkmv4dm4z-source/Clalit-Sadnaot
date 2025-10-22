const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "logs", ".git", "scripts", "tests"].includes(entry.name)) continue;
      scanDir(full);
    } else if (entry.name.endsWith(".js")) {
      const lines = fs.readFileSync(full, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (line.includes("skip:")) {
          console.log(`✅ Found skip in ${full}:${i + 1}\n    ${line.trim()}`);
        }
      });
    }
  }
}

console.log("🔎 Scanning for skip clauses...");
scanDir(root);
console.log("✅ Done.\n");
