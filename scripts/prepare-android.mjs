import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const initialize = process.argv.includes("--init");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

let androidExists = true;
try { await access(resolve(root, "android")); } catch { androidExists = false; }

if (!androidExists) {
  if (!initialize) {
    console.error("A plataforma Android não existe. Execute npm run android:init.");
    process.exit(1);
  }
  run("npx", ["cap", "add", "android"]);
}

run("npx", ["cap", "sync", "android"]);
run("node", ["scripts/generate-assets.mjs"]);

console.log("Projeto Android sincronizado com o código e a identidade visual atuais.");

