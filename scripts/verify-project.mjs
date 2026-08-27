import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "www/index.html",
  "www/styles/app.css",
  "www/scripts/data.js",
  "www/scripts/app.js",
  "www/manifest.webmanifest",
  "www/service-worker.js",
  "www/assets/icons/icon-192.png",
  "www/assets/icons/icon-512.png",
  "assets/brand/rosarium-logo.png"
];

for (const path of required) await access(resolve(root, path));

const html = await readFile(resolve(root, "www/index.html"), "utf8");
for (const reference of ["styles/app.css", "scripts/app.js", "manifest.webmanifest"]) {
  if (!html.includes(reference)) throw new Error(`Referência ausente no HTML: ${reference}`);
}

const data = await readFile(resolve(root, "www/scripts/data.js"), "utf8");
if (/luminos/i.test(data)) throw new Error("Mistérios Luminosos não devem fazer parte deste projeto.");

console.log("Verificação concluída: estrutura, arquivos essenciais e escopo tradicional válidos.");
