import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://rosarium.local/" });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: dom.window.localStorage });

const modulePath = `${pathToFileURL(resolve(root, "www/scripts/agenda-store.js")).href}?test=${Date.now()}`;
const { AgendaDatabase, occursOn, occurrencesBetween } = await import(modulePath);

const weekly = {
  id: "weekly-test",
  kind: "task",
  title: "Santo Terço",
  startDate: "2026-08-31",
  time: "18:00",
  recurrence: { type: "weekly", interval: 1, weekdays: [1, 5] },
  notificationEnabled: true
};

assert.equal(occursOn(weekly, "2026-08-31"), true, "A recorrência semanal deve incluir a segunda-feira inicial.");
assert.equal(occursOn(weekly, "2026-09-01"), false, "A recorrência semanal não deve incluir dias não selecionados.");
assert.equal(occursOn(weekly, "2026-09-04"), true, "A recorrência semanal deve incluir sexta-feira.");

const monthly = { ...weekly, id: "monthly-test", startDate: "2026-08-31", recurrence: { type: "monthly", interval: 1, weekdays: [] } };
assert.equal(occursOn(monthly, "2026-09-30"), true, "Uma tarefa mensal do dia 31 deve cair no último dia de um mês menor.");

const database = new AgendaDatabase();
await database.clear();
await database.saveTask(weekly);
await database.saveTask(monthly);
assert.equal((await database.listTasks()).length, 2, "O banco deve persistir tarefas.");
assert.equal(occurrencesBetween(await database.listTasks(), "2026-08-31", "2026-09-04").length, 3, "O calendário deve materializar as ocorrências recorrentes.");

await database.setCompletion(weekly.id, "2026-08-31", true);
assert.equal((await database.listCompletions()).length, 1, "O histórico deve guardar conclusões por dia.");

const backup = await database.createBackup({ preferences: { language: "pt" } });
assert.equal(backup.format, "rosarium-backup");
assert.equal(backup.version, 1);
assert.equal(backup.agenda.tasks.length, 2);

await database.clear();
await database.importBackup(backup, "replace");
assert.equal((await database.listTasks()).length, 2, "A importação deve restaurar as tarefas.");
assert.equal((await database.listCompletions()).length, 1, "A importação deve restaurar o histórico.");

console.log("Teste da Agenda concluído: recorrências, banco local, histórico e backup funcionando.");
