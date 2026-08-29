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
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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

$("#screen-library [data-home]").click();
$("#btn-agenda").click();
await settle();
assert.equal(visible("#screen-agenda"), true, "A Agenda deve abrir a partir do menu principal.");
assert.equal(visible("#agenda-tasks-panel"), true, "A aba de tarefas deve abrir por padrão.");

$("#btn-new-task").click();
assert.equal(visible("#task-dialog"), true, "O editor interno de tarefas deve abrir.");
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const todayDisplay = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
$("#task-title").value = "Rezar o Santo Terço";
$("#task-date-display").value = "31/02/2026";
$("#task-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await settle();
assert.equal(visible("#task-dialog"), true, "Uma data impossível deve ser recusada no próprio editor.");
assert.match($("#agenda-toast").textContent, /data válida/i, "A validação deve explicar o erro sem caixa externa.");
$("#task-date-display").value = todayDisplay;
$("#task-time").value = "18:00";
$("#task-prayer-target-picker").click();
assert.equal(visible("#option-picker-dialog"), true, "As opções devem abrir em um diálogo interno.");
assert.equal(visible("#task-dialog"), false, "O editor deve ceder lugar ao seletor interno.");
[...document.querySelectorAll("#option-picker-list .option-picker-item")]
  .find((button) => button.textContent.includes("Santo Terço"))
  .click();
assert.equal(visible("#task-dialog"), true, "O editor deve retornar após a seleção.");
assert.equal($("#task-prayer-target").value, "terco", "O seletor interno deve registrar a opção escolhida.");
$("#task-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await settle();
await settle();
assert.equal(document.querySelectorAll("#agenda-task-list .agenda-task-card").length, 1, "Uma tarefa criada deve aparecer na lista do dia.");

$("#agenda-tabs [data-tab=calendar]").click();
assert.equal(visible("#agenda-calendar-panel"), true, "O calendário deve ser acessível pela aba interna.");
assert.equal(document.querySelectorAll("#calendar-grid .calendar-day").length >= 28, true, "O calendário deve renderizar todos os dias do mês.");

$("#agenda-tabs [data-tab=tasks]").click();
$("#agenda-task-list .task-check").click();
await settle();
await settle();
assert.equal($("#agenda-task-list .agenda-task-card").dataset.completed, "true", "A conclusão deve ser registrada por ocorrência.");

console.log("Teste de interface concluído: Terço, Rosário, idioma, biblioteca, Agenda e calendário funcionando.");
