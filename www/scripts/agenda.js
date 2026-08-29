import {
  AgendaDatabase,
  addDays,
  dateKey,
  formatDate,
  nextOccurrence,
  occurrencesBetween,
  parseDateKey
} from "./agenda-store.js";
import {
  agendaCapabilities,
  consumeNativeAgendaActions,
  exportBackupFile,
  importBackupFile,
  syncNativeReminders
} from "./agenda-native.js";

const TYPE_LABELS = {
  prayer: "Oração",
  rosary: "Santo Rosário",
  chaplet: "Santo Terço",
  mass: "Santa Missa",
  novena: "Novena",
  fasting: "Jejum",
  reading: "Leitura espiritual",
  sacrament: "Sacramento",
  intention: "Intenção",
  other: "Outro"
};

const TYPE_ICONS = {
  prayer: "☩", rosary: "✣", chaplet: "✦", mass: "✠", novena: "❈",
  fasting: "◇", reading: "❧", sacrament: "✥", intention: "◌", other: "·"
};

const WEEKDAYS = [
  { value: 0, short: "D", label: "Domingo" },
  { value: 1, short: "S", label: "Segunda-feira" },
  { value: 2, short: "T", label: "Terça-feira" },
  { value: 3, short: "Q", label: "Quarta-feira" },
  { value: 4, short: "Q", label: "Quinta-feira" },
  { value: 5, short: "S", label: "Sexta-feira" },
  { value: 6, short: "S", label: "Sábado" }
];

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

function uid() {
  return globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function completionId(taskId, occurrenceDate) {
  return `${taskId}:${occurrenceDate}`;
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function timeLabel(time) {
  return time || "Sem horário";
}

function recurrenceLabel(task) {
  const recurrence = task.recurrence || { type: "none" };
  if (recurrence.type === "none") return "Uma vez";
  if (recurrence.type === "daily") return "Todos os dias";
  if (recurrence.type === "monthly") return "Todos os meses";
  if (recurrence.type === "yearly") return "Todos os anos";
  if (recurrence.type === "weekly") {
    const names = WEEKDAYS.filter((day) => recurrence.weekdays?.includes(day.value)).map((day) => day.label.split("-")[0].toLowerCase());
    return names.length ? names.join(", ") : "Semanalmente";
  }
  return "Recorrente";
}

function reminderLabel(minutes) {
  const value = Number(minutes) || 0;
  if (!value) return "No horário";
  if (value < 60) return `${value} min antes`;
  return `${value / 60} h antes`;
}

function safeJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("O arquivo selecionado não contém um JSON válido.");
  }
}

export async function createAgendaController(options) {
  const database = new AgendaDatabase();
  let tasks = [];
  let completions = [];
  let currentTab = "tasks";
  let currentFilter = "today";
  let selectedDate = dateKey();
  let calendarMonth = new Date();
  let editingTaskId = null;
  let pendingBackup = null;
  let capabilities = { native: false, notifications: "web", filePicker: false };

  const completionMap = () => new Map(completions.map((item) => [item.id, item]));

  async function reload() {
    [tasks, completions] = await Promise.all([database.listTasks(), database.listCompletions()]);
    tasks.sort((a, b) => `${a.startDate} ${a.time || "23:59"}`.localeCompare(`${b.startDate} ${b.time || "23:59"}`));
  }

  function setStatus(message, tone = "") {
    const status = $("#agenda-backup-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function showToast(message, tone = "") {
    const toast = $("#agenda-toast");
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add("hidden"), 3600);
  }

  async function refresh() {
    await reload();
    renderSummary();
    renderTasks();
    renderCalendar();
  }

  function renderSummary() {
    const today = dateKey();
    const todayOccurrences = occurrencesBetween(tasks, today, today);
    const completed = completionMap();
    const pending = todayOccurrences.filter(({ task, date }) => task.kind === "reminder" || !completed.has(completionId(task.id, date))).length;
    const finished = todayOccurrences.filter(({ task, date }) => task.kind === "task" && completed.has(completionId(task.id, date))).length;
    $("#agenda-summary-date").textContent = capitalize(new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date()));
    $("#agenda-summary-pending").textContent = String(pending);
    $("#agenda-summary-completed").textContent = String(finished);
  }

  function occurrencesForFilter() {
    const today = dateKey();
    if (currentFilter === "today") return occurrencesBetween(tasks, today, today);
    if (currentFilter === "upcoming") return occurrencesBetween(tasks, dateKey(addDays(today, 1)), dateKey(addDays(today, 45)));
    if (currentFilter === "recurring") {
      return tasks.filter((task) => task.recurrence?.type !== "none").map((task) => ({ task, date: nextOccurrence(task) })).filter((item) => item.date);
    }
    if (currentFilter === "completed") {
      const taskMap = new Map(tasks.map((task) => [task.id, task]));
      return completions.map((completion) => ({ task: taskMap.get(completion.taskId), date: completion.date, completion }))
        .filter((item) => item.task).sort((a, b) => b.date.localeCompare(a.date));
    }
    return [];
  }

  function renderTasks() {
    $$("#agenda-filters button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.filter === currentFilter)));
    const titles = { today: "Tarefas de hoje", upcoming: "Próximas tarefas", recurring: "Tarefas recorrentes", completed: "Histórico concluído" };
    $("#agenda-list-title").textContent = titles[currentFilter];
    const list = $("#agenda-task-list");
    list.innerHTML = "";
    const occurrences = occurrencesForFilter();
    const completed = completionMap();
    occurrences.forEach(({ task, date }) => list.appendChild(createTaskCard(task, date, completed.has(completionId(task.id, date)))));
    if (!occurrences.length) {
      const empty = document.createElement("div");
      empty.className = "agenda-empty";
      empty.innerHTML = `<span aria-hidden="true">✦</span><strong>Nada programado</strong><p>${currentFilter === "today" ? "Este dia está livre. Você pode reservar um horário para uma oração." : "Nenhum compromisso foi encontrado nesta seção."}</p>`;
      list.appendChild(empty);
    }
  }

  function createTaskCard(task, occurrenceDate, completed) {
    const card = document.createElement("article");
    card.className = "agenda-task-card";
    card.dataset.completed = String(completed);
    card.dataset.kind = task.kind;
    const isPast = occurrenceDate < dateKey() && task.kind === "task" && !completed;
    if (isPast) card.dataset.overdue = "true";

    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-check";
    check.disabled = task.kind === "reminder";
    check.setAttribute("aria-label", completed ? "Marcar como pendente" : "Marcar como concluída");
    check.innerHTML = task.kind === "reminder" ? "◌" : completed ? "✓" : "";
    if (task.kind === "task") check.addEventListener("click", () => setCompleted(task.id, occurrenceDate, !completed));

    const body = document.createElement("button");
    body.type = "button";
    body.className = "task-card-body";
    body.addEventListener("click", () => openTaskEditor(task, occurrenceDate));
    const heading = document.createElement("span");
    heading.className = "task-card-heading";
    const icon = document.createElement("span");
    icon.className = "task-type-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = TYPE_ICONS[task.type] || TYPE_ICONS.other;
    const title = document.createElement("strong");
    title.textContent = task.title;
    heading.append(icon, title);
    const meta = document.createElement("span");
    meta.className = "task-card-meta";
    const dateText = occurrenceDate === dateKey() ? "Hoje" : formatDate(occurrenceDate, { year: undefined });
    meta.textContent = `${dateText} · ${timeLabel(task.time)} · ${TYPE_LABELS[task.type] || "Tarefa"}`;
    const detail = document.createElement("span");
    detail.className = "task-card-detail";
    detail.textContent = `${recurrenceLabel(task)}${task.notificationEnabled ? ` · ${reminderLabel(task.reminderMinutes)}` : ""}${isPast ? " · atrasada" : ""}`;
    body.append(heading, meta, detail);

    card.append(check, body);
    if (task.prayerTarget && task.prayerTarget !== "none") {
      const pray = document.createElement("button");
      pray.type = "button";
      pray.className = "task-pray-button";
      pray.textContent = "Rezar";
      pray.addEventListener("click", () => options.onStartPrayer(task, occurrenceDate));
      card.appendChild(pray);
    }
    return card;
  }

  function renderCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    $("#calendar-month-label").textContent = capitalize(new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(calendarMonth));
    const grid = $("#calendar-grid");
    grid.innerHTML = "";
    const mondayFirst = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const completed = completionMap();
    for (let index = 0; index < mondayFirst; index++) {
      const spacer = document.createElement("span");
      spacer.className = "calendar-spacer";
      grid.appendChild(spacer);
    }
    for (let day = 1; day <= days; day++) {
      const value = dateKey(new Date(year, month, day));
      const dayTasks = occurrencesBetween(tasks, value, value);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-day";
      button.dataset.today = String(value === dateKey());
      button.dataset.selected = String(value === selectedDate);
      button.setAttribute("aria-label", `${formatDate(value)}${dayTasks.length ? `, ${dayTasks.length} compromisso(s)` : ""}`);
      const number = document.createElement("span");
      number.textContent = String(day);
      const markers = document.createElement("span");
      markers.className = "calendar-markers";
      dayTasks.slice(0, 3).forEach(({ task }) => {
        const marker = document.createElement("i");
        marker.dataset.kind = task.kind;
        marker.dataset.completed = String(completed.has(completionId(task.id, value)));
        markers.appendChild(marker);
      });
      button.append(number, markers);
      button.addEventListener("click", () => {
        selectedDate = value;
        renderCalendar();
      });
      grid.appendChild(button);
    }
    renderSelectedDay();
  }

  function renderSelectedDay() {
    $("#calendar-selected-title").textContent = capitalize(formatDate(selectedDate, { weekday: "long" }));
    const list = $("#calendar-day-list");
    list.innerHTML = "";
    const completed = completionMap();
    const items = occurrencesBetween(tasks, selectedDate, selectedDate);
    items.forEach(({ task, date }) => list.appendChild(createTaskCard(task, date, completed.has(completionId(task.id, date)))));
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "calendar-day-empty";
      empty.textContent = "Nenhuma tarefa ou lembrete neste dia.";
      list.appendChild(empty);
    }
    $("#btn-new-task-day").textContent = `Adicionar em ${parseDateKey(selectedDate).getDate()}`;
  }

  function setTab(tab) {
    currentTab = tab;
    $$("#agenda-tabs button").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.tab === tab)));
    $("#agenda-tasks-panel").classList.toggle("hidden", tab !== "tasks");
    $("#agenda-calendar-panel").classList.toggle("hidden", tab !== "calendar");
    if (tab === "calendar") renderCalendar(); else renderTasks();
  }

  function taskFromForm() {
    const existing = tasks.find((task) => task.id === editingTaskId);
    const selectedKind = $("#task-kind-control button[aria-checked=true]")?.dataset.value || "task";
    const recurrenceType = $("#task-recurrence").value;
    const weekdays = $$("#task-weekdays button[aria-pressed=true]").map((button) => Number(button.dataset.day));
    const now = new Date().toISOString();
    return {
      id: existing?.id || uid(),
      kind: selectedKind,
      title: $("#task-title").value.trim(),
      type: $("#task-type").value,
      notes: $("#task-notes").value.trim(),
      startDate: $("#task-date").value,
      endDate: $("#task-end-date").value || "",
      time: $("#task-time").value || "",
      recurrence: { type: recurrenceType, interval: 1, weekdays: recurrenceType === "weekly" ? weekdays : [] },
      notificationEnabled: $("#task-notification").checked,
      reminderMinutes: Number($("#task-reminder").value) || 0,
      prayerTarget: $("#task-prayer-target").value,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
  }

  function fillKind(kind) {
    $$("#task-kind-control button").forEach((button) => button.setAttribute("aria-checked", String(button.dataset.value === kind)));
  }

  function fillWeekdays(days) {
    $$("#task-weekdays button").forEach((button) => button.setAttribute("aria-pressed", String(days.includes(Number(button.dataset.day)))));
  }

  function openTaskEditor(task = null, occurrenceDate = selectedDate) {
    editingTaskId = task?.id || null;
    $("#task-dialog-title").textContent = task ? "Editar compromisso" : "Novo compromisso";
    fillKind(task?.kind || "task");
    $("#task-title").value = task?.title || "";
    $("#task-type").value = task?.type || "prayer";
    $("#task-date").value = task?.startDate || occurrenceDate || dateKey();
    $("#task-time").value = task?.time || "18:00";
    $("#task-recurrence").value = task?.recurrence?.type || "none";
    $("#task-end-date").value = task?.endDate || "";
    $("#task-notification").checked = task?.notificationEnabled ?? true;
    $("#task-reminder").value = String(task?.reminderMinutes || 0);
    $("#task-prayer-target").value = task?.prayerTarget || "none";
    $("#task-notes").value = task?.notes || "";
    fillWeekdays(task?.recurrence?.weekdays || [parseDateKey($("#task-date").value).getDay()]);
    $("#btn-delete-task").classList.toggle("hidden", !task);
    updateFormDependencies();
    options.openDialog($("#task-dialog"), $("#task-title"));
  }

  function updateFormDependencies() {
    const weekly = $("#task-recurrence").value === "weekly";
    $("#task-weekdays-field").classList.toggle("hidden", !weekly);
    const notification = $("#task-notification").checked;
    $("#task-reminder").disabled = !notification;
    $("#task-end-date").min = $("#task-date").value;
    $("#task-notification-help").textContent = capabilities.native
      ? "O Android avisará mesmo com o Rosarium fechado."
      : "Na versão web, o horário será salvo, mas a notificação exige o aplicativo Android.";
  }

  async function saveForm(event) {
    event.preventDefault();
    const task = taskFromForm();
    if (!task.title || !task.startDate) {
      showToast("Informe pelo menos o título e a data.", "error");
      return;
    }
    if (task.recurrence.type === "weekly" && !task.recurrence.weekdays.length) {
      showToast("Escolha ao menos um dia da semana.", "error");
      return;
    }
    if (task.endDate && task.endDate < task.startDate) {
      showToast("A data final não pode ser anterior à data inicial.", "error");
      return;
    }
    if (task.notificationEnabled && !task.time) {
      showToast("Escolha um horário para ativar a notificação.", "error");
      return;
    }
    await database.saveTask(task);
    options.closeDialog($("#task-dialog"));
    await refresh();
    const sync = await syncReminders(task.notificationEnabled);
    if (sync.permission === "denied") showToast("Tarefa salva. Autorize notificações nas configurações do Android.", "warning");
    else showToast(editingTaskId ? "Compromisso atualizado." : "Compromisso criado.", "success");
    editingTaskId = null;
  }

  async function setCompleted(taskId, occurrenceDate, completed) {
    await database.setCompletion(taskId, occurrenceDate, completed);
    await refresh();
    await syncReminders(false);
    showToast(completed ? "Tarefa concluída. Deo gratias!" : "Tarefa marcada como pendente.", completed ? "success" : "");
  }

  async function removeEditingTask() {
    const task = tasks.find((item) => item.id === editingTaskId);
    if (!task) return;
    options.closeDialog($("#task-dialog"));
    options.showConfirm("Excluir compromisso?", `“${task.title}” e seu histórico serão removidos deste aparelho.`, async () => {
      await database.deleteTask(task.id);
      editingTaskId = null;
      await refresh();
      await syncReminders(false);
      showToast("Compromisso excluído.");
    });
  }

  async function syncReminders(requestPermission) {
    const nativeTasks = tasks.map((task) => ({
      ...task,
      completedDates: completions.filter((item) => item.taskId === task.id).map((item) => item.date)
    }));
    const result = await syncNativeReminders(nativeTasks, requestPermission);
    const nativeStatus = $("#agenda-native-status");
    if (nativeStatus) {
      nativeStatus.textContent = capabilities.native
        ? result.permission === "denied" ? "Integração Android ativa · notificações não autorizadas" : `Integração Android ativa · ${result.scheduled || 0} lembrete(s) programado(s)`
        : "Prévia web · notificações disponíveis no aplicativo Android";
      nativeStatus.dataset.tone = result.permission === "denied" ? "warning" : "";
    }
    return result;
  }

  async function exportBackup() {
    try {
      const backup = await database.createBackup(options.getCoreBackup());
      const result = await exportBackupFile(backup);
      setStatus(`Backup exportado: ${result.fileName || "Rosarium-backup.json"}`, "success");
      showToast("Backup criado com sucesso.", "success");
    } catch (error) {
      if (/cancel/i.test(error?.message || "")) return;
      setStatus(error?.message || "Não foi possível exportar o backup.", "error");
    }
  }

  async function chooseBackup() {
    try {
      const result = await importBackupFile();
      const payload = safeJson(result.content);
      database.validateBackup(payload);
      pendingBackup = payload;
      $("#backup-file-name").textContent = result.fileName;
      $("#backup-summary").textContent = `${payload.agenda.tasks.length} compromisso(s) e ${payload.agenda.completions.length} conclusão(ões), exportados em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(payload.exportedAt))}.`;
      options.openDialog($("#backup-import-dialog"), $("#btn-import-merge"));
    } catch (error) {
      if (/cancel|selecionado/i.test(error?.message || "")) return;
      setStatus(error?.message || "Não foi possível importar o backup.", "error");
    }
  }

  async function applyBackup(mode) {
    if (!pendingBackup) return;
    try {
      await database.importBackup(pendingBackup, mode);
      options.restoreCoreBackup(pendingBackup.application || {}, mode);
      pendingBackup = null;
      options.closeDialog($("#backup-import-dialog"));
      await refresh();
      await syncReminders(true);
      setStatus(`Backup ${mode === "replace" ? "restaurado" : "combinado"} com sucesso.`, "success");
      showToast("Dados importados com sucesso.", "success");
    } catch (error) {
      setStatus(error?.message || "A importação falhou.", "error");
    }
  }

  async function consumeNativeActions(openOnLaunch = false) {
    const actions = await consumeNativeAgendaActions();
    for (const completion of actions.completions || []) {
      if (completion.taskId && completion.date) await database.setCompletion(completion.taskId, completion.date, true);
    }
    if ((actions.completions || []).length) await reload();
    if (actions.launchTaskId) {
      selectedDate = actions.launchDate || dateKey();
      calendarMonth = parseDateKey(selectedDate);
      currentTab = "tasks";
      currentFilter = selectedDate === dateKey() ? "today" : "upcoming";
      await open();
      const task = tasks.find((item) => item.id === actions.launchTaskId);
      if (task) openTaskEditor(task, selectedDate);
    } else if (openOnLaunch && (actions.completions || []).length) {
      await refresh();
    }
  }

  async function open() {
    await reload();
    renderSummary();
    setTab(currentTab);
    options.showScreen("screen-agenda");
  }

  function shiftMonth(amount) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + amount, 1);
    selectedDate = dateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1));
    renderCalendar();
  }

  function bindEvents() {
    $("#btn-agenda").addEventListener("click", open);
    $$("#agenda-tabs button").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
    $$("#agenda-filters button").forEach((button) => button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      renderTasks();
    }));
    $("#btn-new-task").addEventListener("click", () => openTaskEditor(null, dateKey()));
    $("#btn-new-task-day").addEventListener("click", () => openTaskEditor(null, selectedDate));
    $("#btn-calendar-prev").addEventListener("click", () => shiftMonth(-1));
    $("#btn-calendar-next").addEventListener("click", () => shiftMonth(1));
    $("#btn-calendar-today").addEventListener("click", () => {
      selectedDate = dateKey();
      calendarMonth = new Date();
      renderCalendar();
    });
    $("#btn-close-task-dialog").addEventListener("click", () => options.closeDialog($("#task-dialog")));
    $("#task-form").addEventListener("submit", saveForm);
    $("#btn-delete-task").addEventListener("click", removeEditingTask);
    $$("#task-kind-control button").forEach((button) => button.addEventListener("click", () => fillKind(button.dataset.value)));
    $$("#task-weekdays button").forEach((button) => button.addEventListener("click", () => button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"))));
    $("#task-recurrence").addEventListener("change", updateFormDependencies);
    $("#task-notification").addEventListener("change", updateFormDependencies);
    $("#task-date").addEventListener("change", () => {
      if ($$("#task-weekdays button[aria-pressed=true]").length === 1) fillWeekdays([parseDateKey($("#task-date").value).getDay()]);
      updateFormDependencies();
    });
    $("#btn-export-backup").addEventListener("click", exportBackup);
    $("#btn-import-backup").addEventListener("click", chooseBackup);
    $("#btn-clear-agenda").addEventListener("click", () => options.showConfirm("Apagar a Agenda?", "Todas as tarefas, lembretes e conclusões serão removidos deste aparelho.", async () => {
      await database.clear();
      await refresh();
      await syncReminders(false);
      setStatus("Agenda apagada deste aparelho.");
    }));
    $("#btn-close-backup-import").addEventListener("click", () => {
      pendingBackup = null;
      options.closeDialog($("#backup-import-dialog"));
    });
    $("#btn-import-merge").addEventListener("click", () => applyBackup("merge"));
    $("#btn-import-replace").addEventListener("click", () => applyBackup("replace"));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") consumeNativeActions(true);
    });
  }

  capabilities = await agendaCapabilities();
  bindEvents();
  await reload();
  await syncReminders(false);
  await consumeNativeActions(false);

  return {
    open,
    refresh,
    completeTask: setCompleted,
    async getTask(taskId) {
      if (!tasks.length) await reload();
      return tasks.find((task) => task.id === taskId) || null;
    }
  };
}
