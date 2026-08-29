const DATABASE_NAME = "rosarium-local";
const DATABASE_VERSION = 1;
const TASKS_STORE = "tasks";
const COMPLETIONS_STORE = "completions";
const FALLBACK_KEY = "rosarium.agenda.database.v1";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function fallbackDatabase() {
  try {
    const saved = JSON.parse(localStorage.getItem(FALLBACK_KEY));
    if (saved?.tasks && saved?.completions) return saved;
  } catch {}
  return { tasks: [], completions: [] };
}

function saveFallback(database) {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(database));
}

function openDatabase() {
  if (!("indexedDB" in globalThis) || !globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(TASKS_STORE)) {
        const tasks = database.createObjectStore(TASKS_STORE, { keyPath: "id" });
        tasks.createIndex("startDate", "startDate", { unique: false });
        tasks.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(COMPLETIONS_STORE)) {
        const completions = database.createObjectStore(COMPLETIONS_STORE, { keyPath: "id" });
        completions.createIndex("taskId", "taskId", { unique: false });
        completions.createIndex("date", "date", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Não foi possível abrir o banco local."));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Falha ao consultar o banco local."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Falha ao salvar no banco local."));
    transaction.onabort = () => reject(transaction.error || new Error("A gravação no banco local foi cancelada."));
  });
}

export class AgendaDatabase {
  constructor() {
    this.database = openDatabase().catch(() => null);
  }

  async listTasks() {
    const database = await this.database;
    if (!database) return clone(fallbackDatabase().tasks);
    const transaction = database.transaction(TASKS_STORE, "readonly");
    return requestValue(transaction.objectStore(TASKS_STORE).getAll());
  }

  async listCompletions() {
    const database = await this.database;
    if (!database) return clone(fallbackDatabase().completions);
    const transaction = database.transaction(COMPLETIONS_STORE, "readonly");
    return requestValue(transaction.objectStore(COMPLETIONS_STORE).getAll());
  }

  async saveTask(task) {
    const database = await this.database;
    if (!database) {
      const data = fallbackDatabase();
      const index = data.tasks.findIndex((item) => item.id === task.id);
      if (index >= 0) data.tasks[index] = clone(task); else data.tasks.push(clone(task));
      saveFallback(data);
      return task;
    }
    const transaction = database.transaction(TASKS_STORE, "readwrite");
    transaction.objectStore(TASKS_STORE).put(clone(task));
    await transactionDone(transaction);
    return task;
  }

  async deleteTask(taskId) {
    const database = await this.database;
    if (!database) {
      const data = fallbackDatabase();
      data.tasks = data.tasks.filter((task) => task.id !== taskId);
      data.completions = data.completions.filter((completion) => completion.taskId !== taskId);
      saveFallback(data);
      return;
    }
    const transaction = database.transaction([TASKS_STORE, COMPLETIONS_STORE], "readwrite");
    transaction.objectStore(TASKS_STORE).delete(taskId);
    const completionStore = transaction.objectStore(COMPLETIONS_STORE);
    const index = completionStore.index("taskId");
    const cursorRequest = index.openCursor(IDBKeyRange.only(taskId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    await transactionDone(transaction);
  }

  async setCompletion(taskId, date, completed) {
    const id = `${taskId}:${date}`;
    const database = await this.database;
    if (!database) {
      const data = fallbackDatabase();
      data.completions = data.completions.filter((item) => item.id !== id);
      if (completed) data.completions.push({ id, taskId, date, completedAt: new Date().toISOString() });
      saveFallback(data);
      return;
    }
    const transaction = database.transaction(COMPLETIONS_STORE, "readwrite");
    const store = transaction.objectStore(COMPLETIONS_STORE);
    if (completed) store.put({ id, taskId, date, completedAt: new Date().toISOString() });
    else store.delete(id);
    await transactionDone(transaction);
  }

  async createBackup(core = {}) {
    const [tasks, completions] = await Promise.all([this.listTasks(), this.listCompletions()]);
    return {
      format: "rosarium-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      application: core,
      agenda: { tasks, completions }
    };
  }

  validateBackup(payload) {
    if (!payload || payload.format !== "rosarium-backup") throw new Error("Este arquivo não é um backup do Rosarium.");
    if (!Number.isInteger(payload.version) || payload.version < 1 || payload.version > 1) {
      throw new Error("A versão deste backup ainda não é compatível com o aplicativo.");
    }
    if (!Array.isArray(payload.agenda?.tasks) || !Array.isArray(payload.agenda?.completions)) {
      throw new Error("O backup está incompleto ou corrompido.");
    }
    for (const task of payload.agenda.tasks) {
      if (!task?.id || !task?.title || !/^\d{4}-\d{2}-\d{2}$/.test(task.startDate || "")) {
        throw new Error("O backup contém uma tarefa inválida.");
      }
    }
    return payload;
  }

  async importBackup(payload, mode = "merge") {
    this.validateBackup(payload);
    const database = await this.database;
    if (!database) {
      const current = mode === "replace" ? { tasks: [], completions: [] } : fallbackDatabase();
      const taskMap = new Map(current.tasks.map((task) => [task.id, task]));
      const completionMap = new Map(current.completions.map((item) => [item.id, item]));
      payload.agenda.tasks.forEach((task) => taskMap.set(task.id, clone(task)));
      payload.agenda.completions.forEach((item) => completionMap.set(item.id, clone(item)));
      saveFallback({ tasks: [...taskMap.values()], completions: [...completionMap.values()] });
      return;
    }
    const transaction = database.transaction([TASKS_STORE, COMPLETIONS_STORE], "readwrite");
    const tasks = transaction.objectStore(TASKS_STORE);
    const completions = transaction.objectStore(COMPLETIONS_STORE);
    if (mode === "replace") {
      tasks.clear();
      completions.clear();
    }
    payload.agenda.tasks.forEach((task) => tasks.put(clone(task)));
    payload.agenda.completions.forEach((item) => completions.put(clone(item)));
    await transactionDone(transaction);
  }

  async clear() {
    const database = await this.database;
    if (!database) {
      saveFallback({ tasks: [], completions: [] });
      return;
    }
    const transaction = database.transaction([TASKS_STORE, COMPLETIONS_STORE], "readwrite");
    transaction.objectStore(TASKS_STORE).clear();
    transaction.objectStore(COMPLETIONS_STORE).clear();
    await transactionDone(transaction);
  }
}

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(value, amount) {
  const date = typeof value === "string" ? parseDateKey(value) : new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function daysBetween(start, end) {
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((b - a) / 86400000);
}

function monthsBetween(start, end) {
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
}

function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function occursOn(task, value) {
  const date = typeof value === "string" ? parseDateKey(value) : value;
  const start = parseDateKey(task.startDate);
  const currentKey = dateKey(date);
  if (currentKey < task.startDate || (task.endDate && currentKey > task.endDate)) return false;
  const recurrence = task.recurrence || { type: "none", interval: 1 };
  const interval = Math.max(1, Number(recurrence.interval) || 1);

  if (recurrence.type === "none") return currentKey === task.startDate;
  if (recurrence.type === "daily") return daysBetween(start, date) % interval === 0;
  if (recurrence.type === "weekly") {
    const weekdays = Array.isArray(recurrence.weekdays) && recurrence.weekdays.length ? recurrence.weekdays : [start.getDay()];
    return weekdays.includes(date.getDay()) && Math.floor(daysBetween(start, date) / 7) % interval === 0;
  }
  if (recurrence.type === "monthly") {
    const targetDay = Math.min(start.getDate(), lastDayOfMonth(date.getFullYear(), date.getMonth()));
    return date.getDate() === targetDay && monthsBetween(start, date) % interval === 0;
  }
  if (recurrence.type === "yearly") {
    return date.getMonth() === start.getMonth() && date.getDate() === start.getDate() && (date.getFullYear() - start.getFullYear()) % interval === 0;
  }
  return false;
}

export function occurrencesBetween(tasks, startValue, endValue) {
  const start = typeof startValue === "string" ? parseDateKey(startValue) : new Date(startValue);
  const end = typeof endValue === "string" ? parseDateKey(endValue) : new Date(endValue);
  const occurrences = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    const occurrenceDate = dateKey(cursor);
    for (const task of tasks) {
      if (occursOn(task, cursor)) occurrences.push({ task, date: occurrenceDate });
    }
  }
  return occurrences.sort((a, b) => `${a.date} ${a.task.time || "23:59"}`.localeCompare(`${b.date} ${b.task.time || "23:59"}`));
}

export function nextOccurrence(task, from = new Date(), limitDays = 730) {
  const start = parseDateKey(dateKey(from));
  for (let offset = 0; offset <= limitDays; offset++) {
    const current = addDays(start, offset);
    if (occursOn(task, current)) return dateKey(current);
  }
  return null;
}

export function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", ...options }).format(parseDateKey(value));
}
