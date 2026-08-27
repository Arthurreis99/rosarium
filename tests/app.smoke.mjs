import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(resolve(root, "www/index.html"), "utf8");
const dom = new JSDOM(html, { url: "https://rosarium.local/", pretendToBeVisual: true });
const { window } = dom;
window.scrollTo = () => {};

for (const key of ["window", "document", "navigator", "localStorage", "history", "location", "requestAnimationFrame"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: window[key]?.bind?.(window) ?? window[key] });
}

await import(`${pathToFileURL(resolve(root, "www/scripts/app.js")).href}?smoke=${Date.now()}`);

const $ = (selector, parent = document) => parent.querySelector(selector);
const visible = (selector) => !$(selector).classList.contains("hidden");

assert.equal(visible("#screen-home"), true, "A tela inicial deve abrir.");
assert.equal(document.querySelectorAll("[data-open-settings]").length >= 3, true, "Configurações devem estar acessíveis nas telas principais.");

$("#btn-terco").click();
assert.equal(visible("#screen-select"), true, "A seleção do Terço deve abrir.");
assert.equal(document.querySelectorAll(".mystery-option").length, 3, "O Terço deve oferecer três grupos tradicionais.");

$(".mystery-option").click();
assert.equal(visible("#screen-pray"), true, "O fluxo de oração deve iniciar.");
assert.match($("#prayer-title").textContent, /Sinal da Cruz/i);
const firstCounter = $("#step-counter").textContent;
$("#btn-next").click();
assert.notEqual($("#step-counter").textContent, firstCounter, "O botão Avançar deve alterar o passo.");

$("#screen-pray [data-open-settings]").click();
assert.equal(visible("#settings-dialog"), true, "As configurações internas devem abrir.");
$("[data-setting=language] [data-value=la]").click();
assert.equal(document.documentElement.lang, "la", "O idioma principal deve mudar para latim.");
$("#btn-close-settings").click();

$("#screen-pray [data-home]").click();
$("#btn-santo-rosario").click();
$("#btn-start-full").click();
$("#btn-open-navigation").click();
assert.equal(document.querySelectorAll("#navigation-mysteries .navigation-item").length, 15, "O Santo Rosário deve conter quinze mistérios.");
$("#btn-close-navigation").click();

$("#screen-pray [data-home]").click();
$("#btn-library").click();
assert.equal(document.querySelectorAll(".library-prayer").length, 12, "A biblioteca deve listar todas as orações do aplicativo.");
$("#prayer-search").value = "Miguel";
$("#prayer-search").dispatchEvent(new window.Event("input", { bubbles: true }));
assert.equal(document.querySelectorAll(".library-prayer").length, 1, "A busca da biblioteca deve filtrar as orações.");

console.log("Teste de interface concluído: Terço, Rosário, idioma, navegação e biblioteca funcionando.");
