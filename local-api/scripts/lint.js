// Dependency-free lint: syntax-check every source and test file.
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [];
});
let failed = 0;
for (const f of [...walk("src"), ...walk("test"), ...walk("scripts")]) {
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  if (r.status !== 0) { failed++; console.error(r.stderr); }
}
console.log(failed ? `${failed} file(s) failed` : "lint ok");
process.exit(failed ? 1 : 0);
