import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

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
  "www/assets/brand/rosarium-mark.png",
  ".github/workflows/pages.yml",
  "assets/brand/rosarium-logo.png"
];

for (const path of required) await access(resolve(root, path));

const html = await readFile(resolve(root, "www/index.html"), "utf8");
for (const reference of ["styles/app.css", "scripts/app.js", "manifest.webmanifest"]) {
  if (!html.includes(reference)) throw new Error(`Referência ausente no HTML: ${reference}`);
}

const data = await readFile(resolve(root, "www/scripts/data.js"), "utf8");
if (/luminos/i.test(data)) throw new Error("Mistérios Luminosos não devem fazer parte deste projeto.");

const css = await readFile(resolve(root, "www/styles/app.css"), "utf8");
if (/Cinzel/i.test(css)) throw new Error("A fonte epigráfica que confunde U e V ainda está ativa.");
if (!css.includes(".topbar-home .icon-button{grid-column:3")) {
  throw new Error("O botão de configurações da tela inicial não está fixado na coluna direita.");
}

const mark = await sharp(resolve(root, "www/assets/brand/rosarium-mark.png"))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (mark.data[3] !== 0) throw new Error("A marca interna precisa ter fundo transparente.");

console.log("Verificação concluída: estrutura, transparência, tipografia, navegação e escopo tradicional válidos.");
