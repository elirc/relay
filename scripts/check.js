import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
let count = 0;
function check(directory) {
  if (!existsSync(directory)) return;
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) check(path);
    else if (/\.(?:js|mjs)$/.test(item.name)) {
      const result = spawnSync(process.execPath, ["--check", path], {
        stdio: "inherit",
      });
      if (result.status !== 0) process.exit(result.status || 1);
      count++;
    }
  }
}
["src", "public", "scripts", "tests"].forEach(check);
console.log(`Syntax checked ${count} JavaScript files.`);
