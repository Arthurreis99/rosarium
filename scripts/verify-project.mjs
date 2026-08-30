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
  "www/scripts/agenda.js",
  "www/scripts/agenda-store.js",
  "www/scripts/agenda-native.js",
  "www/manifest.webmanifest",
  "www/service-worker.js",
  "www/assets/icons/icon-192.png",
  "www/assets/icons/icon-512.png",
  "www/assets/brand/rosarium-mark.png",
  ".github/workflows/pages.yml",
  "assets/brand/rosarium-logo.png",
  "native/android/java/com/arthurmedeiros/rosarium/RosariumAgendaPlugin.kt",
  "native/android/java/com/arthurmedeiros/rosarium/AgendaScheduler.kt",
  "native/android/java/com/arthurmedeiros/rosarium/AgendaReminderReceiver.kt",
  "native/android/java/com/arthurmedeiros/rosarium/AgendaBootReceiver.kt"
];

for (const path of required) await access(resolve(root, path));

const html = await readFile(resolve(root, "www/index.html"), "utf8");
for (const reference of ["styles/app.css", "scripts/app.js", "manifest.webmanifest"]) {
  if (!html.includes(reference)) throw new Error(`Referência ausente no HTML: ${reference}`);
}
for (const elementId of ["btn-agenda", "screen-agenda", "agenda-tabs", "calendar-grid", "task-dialog", "option-picker-dialog", "btn-export-backup", "btn-import-backup"]) {
  if (!html.includes(`id="${elementId}"`)) throw new Error(`Elemento da Agenda ausente: ${elementId}`);
}

const data = await readFile(resolve(root, "www/scripts/data.js"), "utf8");
if (/luminos/i.test(data)) throw new Error("Mistérios Luminosos não devem fazer parte deste projeto.");

const css = await readFile(resolve(root, "www/styles/app.css"), "utf8");
if (/Cinzel/i.test(css)) throw new Error("A fonte epigráfica que confunde U e V ainda está ativa.");
if (!css.includes(".topbar-home .icon-button{grid-column:3")) {
  throw new Error("O botão de configurações da tela inicial não está fixado na coluna direita.");
}

const serviceWorker = await readFile(resolve(root, "www/service-worker.js"), "utf8");
for (const moduleName of ["agenda.js", "agenda-store.js", "agenda-native.js"]) {
  if (!serviceWorker.includes(moduleName)) throw new Error(`Módulo da Agenda ausente do cache offline: ${moduleName}`);
}

const nativeScheduler = await readFile(resolve(root, "native/android/java/com/arthurmedeiros/rosarium/AgendaScheduler.kt"), "utf8");
if (!nativeScheduler.includes("setExactAndAllowWhileIdle") || !nativeScheduler.includes("canScheduleExactAlarms") || !nativeScheduler.includes("rescheduleAll")) {
  throw new Error("A integração Android não programa ou restaura corretamente os lembretes.");
}

const androidPreparation = await readFile(resolve(root, "scripts/prepare-android.mjs"), "utf8");
for (const requirement of ["android.permission.SCHEDULE_EXACT_ALARM", "SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"]) {
  if (!androidPreparation.includes(requirement)) throw new Error(`Integração Android incompleta: ${requirement}`);
}

const mark = await sharp(resolve(root, "www/assets/brand/rosarium-mark.png"))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (mark.data[3] !== 0) throw new Error("A marca interna precisa ter fundo transparente.");

console.log("Verificação concluída: estrutura, transparência, tipografia, navegação e escopo tradicional válidos.");
