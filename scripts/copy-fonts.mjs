import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "www/assets/fonts");

await mkdir(target, { recursive: true });

const files = [
  ["node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff2", "eb-garamond-400.woff2"],
  ["node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-500-normal.woff2", "eb-garamond-500.woff2"],
  ["node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff2", "eb-garamond-400-italic.woff2"]
];

for (const [source, name] of files) {
  await copyFile(resolve(root, source), resolve(target, name));
}

console.log(`Fontes locais preparadas em ${target}`);
