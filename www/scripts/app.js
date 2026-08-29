import { PRAYERS, MYSTERY_SETS, SET_ORDER, LIBRARY_ORDER, suggestedMystery } from "./data.js";
import { createAgendaController } from "./agenda.js";

const STORAGE = {
  progress: "rosarium.progress.v3",
  preferences: "rosarium.preferences.v3"
};

const DEFAULT_PREFERENCES = {
  language: "pt",
  fontSize: "normal",
  theme: "classic",
  translationDefault: false,
  focusMode: false,
  keepAwake: false
};

const state = { mode: null, setKey: null, sequence: [], index: 0, agendaContext: null };
let preferences = loadPreferences();
let wakeLock = null;
let lastFocusedElement = null;
let confirmCallback = null;
let agendaController = null;
let pendingAgendaContext = null;

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const screens = $$(".screen");

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.preferences));
    if (saved) return { ...DEFAULT_PREFERENCES, ...saved };
    const legacy = JSON.parse(localStorage.getItem("rosarium.preferences.v1"));
    if (legacy) return { ...DEFAULT_PREFERENCES, ...legacy, language: "pt" };
  } catch {}
  return { ...DEFAULT_PREFERENCES };
}

function savePreferences() {
  localStorage.setItem(STORAGE.preferences, JSON.stringify(preferences));
}

function applyPreferences() {
  document.body.dataset.fontSize = preferences.fontSize;
  document.body.dataset.theme = preferences.theme;
  document.body.classList.toggle("focus-mode", preferences.focusMode);
  document.documentElement.lang = preferences.language === "pt" ? "pt-BR" : "la";
}

function saveProgress() {
  if (!state.mode || !state.sequence.length) return;
  localStorage.setItem(STORAGE.progress, JSON.stringify({ mode: state.mode, setKey: state.setKey, index: state.index, agendaContext: state.agendaContext }));
  renderContinueCard();
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.progress));
    if (saved?.mode === "rosario" || (saved?.mode === "terco" && MYSTERY_SETS[saved.setKey])) return saved;
    const legacy = JSON.parse(localStorage.getItem("rosarium.progress.v1"));
    if (legacy && MYSTERY_SETS[legacy.setKey]) return { mode: "terco", setKey: legacy.setKey, index: legacy.index || 0 };
  } catch {}
  return null;
}

function clearProgress() {
  localStorage.removeItem(STORAGE.progress);
  localStorage.removeItem("rosarium.progress.v1");
  renderContinueCard();
}

function buildSequence(mode, selectedSet) {
  const sequence = [
    { type: "signum", phase: "intro" },
    { type: "credo", phase: "intro" },
    { type: "pater", phase: "intro" },
    ...Array.from({ length: 3 }, (_, index) => ({ type: "ave", phase: "intro", aveIndex: index + 1, aveTotal: 3 })),
    { type: "gloria", phase: "intro" }
  ];

  const sets = mode === "rosario" ? SET_ORDER : [selectedSet];
  let globalMysteryIndex = 0;
  for (const setKey of sets) {
    MYSTERY_SETS[setKey].items.forEach((mystery, mysteryIndex) => {
      const common = { phase: "mystery", setKey, mysteryIndex, globalMysteryIndex, mystery };
      sequence.push({ type: "mystery", ...common });
      sequence.push({ type: "pater", ...common });
      for (let aveIndex = 1; aveIndex <= 10; aveIndex++) sequence.push({ type: "ave", aveIndex, aveTotal: 10, ...common });
      sequence.push({ type: "gloria", ...common });
      sequence.push({ type: "fatima", ...common });
      globalMysteryIndex += 1;
    });
  }

  sequence.push({ type: "salve", phase: "final" });
  if (mode === "rosario") sequence.push({ type: "litany", phase: "final" });
  sequence.push({ type: "final", phase: "final" });
  sequence.push({ type: "signum", phase: "final" });
  return sequence;
}

function showScreen(id, updateHistory = true) {
  screens.forEach((screen) => screen.classList.toggle("hidden", screen.id !== id));
  $(".progress-rail").classList.toggle("hidden", id !== "screen-pray");
  if (updateHistory && history.state?.screen !== id) history.pushState({ screen: id }, "", "");
  window.scrollTo({ top: 0, behavior: "instant" });
  if (id === "screen-pray") syncWakeLock(); else releaseWakeLock();
}

function goHome(updateHistory = true) {
  closeAllDialogs();
  showScreen("screen-home", false);
  if (updateHistory) history.replaceState({ screen: "screen-home" }, "", "");
  renderContinueCard();
}

function openSelection(mode, agendaContext = null) {
  pendingAgendaContext = agendaContext;
  const isFull = mode === "rosario";
  $("#select-topbar-title").textContent = isFull ? "Santo Rosário" : "Santo Terço";
  $("#select-eyebrow").textContent = isFull ? "Quindecim Mysteria" : "Mysteria Diei";
  $("#select-title").textContent = isFull ? "O Santo Rosário completo" : "Escolha os mistérios";
  $("#select-description").textContent = isFull
    ? "Reze, em sequência, os quinze mistérios tradicionais: Gozosos, Dolorosos e Gloriosos."
    : "Escolha uma coroa de cinco mistérios. A indicação segue a distribuição tradicional, sem os Mistérios Luminosos.";
  $("#today-card").classList.toggle("hidden", isFull);
  $("#mystery-options").classList.toggle("hidden", isFull);
  $("#rosary-overview").classList.toggle("hidden", !isFull);

  if (!isFull) renderMysteryOptions();
  showScreen("screen-select");
}

function renderMysteryOptions() {
  const suggestion = suggestedMystery();
  const container = $("#mystery-options");
  container.innerHTML = "";
  const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  $("#today-mystery").textContent = MYSTERY_SETS[suggestion].title.pt;
  $("#today-date").textContent = date.charAt(0).toUpperCase() + date.slice(1);

  for (const setKey of SET_ORDER) {
    const set = MYSTERY_SETS[setKey];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mystery-option";
    button.dataset.suggested = String(setKey === suggestion);
    button.innerHTML = `<strong>${set.title.pt}</strong><small>${set.days}${setKey === suggestion ? " · indicados hoje" : ""}</small><div class="latin">${set.title.la}</div>`;
    button.addEventListener("click", () => startDevotion("terco", setKey, 0, pendingAgendaContext));
    container.appendChild(button);
  }
}

function startDevotion(mode, setKey = null, index = 0, agendaContext = null) {
  state.mode = mode;
  state.setKey = mode === "terco" ? setKey : null;
  state.sequence = buildSequence(mode, setKey);
  state.index = Math.max(0, Math.min(Number(index) || 0, state.sequence.length - 1));
  state.agendaContext = agendaContext;
  pendingAgendaContext = null;
  showScreen("screen-pray");
  renderPrayerScreen();
  saveProgress();
}

function continueDevotion() {
  const saved = loadProgress();
  if (saved) startDevotion(saved.mode, saved.setKey, saved.index, saved.agendaContext || null);
}

function renderContinueCard() {
  const saved = loadProgress();
  const card = $("#continue-card");
  card.classList.toggle("hidden", !saved);
  if (!saved) return;
  const label = saved.mode === "rosario" ? "Santo Rosário completo" : MYSTERY_SETS[saved.setKey]?.title.pt;
  $("#continue-description").textContent = `${label} · progresso preservado neste dispositivo.`;
}

function renderPrayerScreen() {
  const step = state.sequence[state.index];
  const primary = preferences.language;
  const secondary = primary === "pt" ? "la" : "pt";
  const totalMysteries = state.mode === "rosario" ? 15 : 5;
  const modeName = state.mode === "rosario" ? "Santo Rosário" : "Santo Terço";
  $("#status-mode").textContent = modeName;
  $("#step-counter").textContent = `${state.index + 1} / ${state.sequence.length}`;
  $("#progress-fill").style.width = `${(state.index / Math.max(1, state.sequence.length - 1)) * 100}%`;

  if (step.phase === "mystery") {
    $("#status-current").textContent = `${step.globalMysteryIndex + 1}º de ${totalMysteries} · ${step.mystery.title.pt}`;
  } else {
    $("#status-current").textContent = step.phase === "intro" ? "Orações iniciais" : "Orações finais";
  }

  renderTrack(step);
  renderPrayerCard(step, primary, secondary);
  renderBeads(step);

  $("#btn-prev").disabled = state.index === 0;
  const isLast = state.index === state.sequence.length - 1;
  $("#btn-next").disabled = false;
  $("#btn-next").innerHTML = isLast ? "Concluir <span aria-hidden=\"true\">✓</span>" : "Avançar <span aria-hidden=\"true\">›</span>";
}

function renderPrayerCard(step, primary, secondary) {
  const meditation = step.type === "mystery";
  $("#meditation-block").classList.toggle("hidden", !meditation);
  $("#prayer-primary").classList.toggle("hidden", meditation);
  $("#btn-toggle-translation").classList.toggle("hidden", meditation);
  $("#translation-panel").classList.toggle("hidden", meditation || !preferences.translationDefault);

  const phaseLabel = step.phase === "intro" ? "Orações iniciais" : step.phase === "final" ? "Orações finais" : MYSTERY_SETS[step.setKey].title[primary];
  $("#prayer-eyebrow").textContent = step.type === "ave" ? `${phaseLabel} · ${step.aveIndex} de ${step.aveTotal}` : phaseLabel;

  if (meditation) {
    $("#prayer-title").textContent = `${step.globalMysteryIndex + 1}º Mistério · ${step.mystery.title[primary]}`;
    $("#meditation-primary").textContent = step.mystery.meditation[primary];
    $("#meditation-secondary").textContent = `${step.mystery.title[secondary]} — ${step.mystery.meditation[secondary]}`;
    return;
  }

  const prayer = PRAYERS[step.type];
  $("#prayer-title").textContent = prayer.title[primary];
  $("#prayer-primary").textContent = prayer.text[primary];
  $("#prayer-translation").textContent = prayer.text[secondary];
  $("#translation-language").textContent = secondary === "pt" ? "Tradução em português" : "Tradução em latim";
  $("#translation-label").textContent = preferences.translationDefault ? "Ocultar tradução" : secondary === "pt" ? "Ver em português" : "Ver em latim";
  $("#btn-toggle-translation").setAttribute("aria-expanded", String(preferences.translationDefault));
}

function renderTrack(step) {
  const track = $("#mystery-track");
  track.innerHTML = "";
  const total = state.mode === "rosario" ? 15 : 5;
  const active = step.phase === "mystery" ? step.globalMysteryIndex : null;
  for (let index = 0; index < total; index++) {
    if (state.mode === "rosario" && (index === 5 || index === 10)) {
      const separator = document.createElement("span");
      separator.className = "mystery-set-separator";
      track.appendChild(separator);
    }
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "mystery-dot";
    dot.dataset.state = active === index ? "current" : active !== null && index < active ? "done" : "pending";
    dot.setAttribute("aria-label", `${index + 1}º mistério`);
    dot.addEventListener("click", () => jumpToMystery(index));
    track.appendChild(dot);
  }
}

function renderBeads(step) {
  const container = $("#rosary-beads");
  container.innerHTML = "";
  const phase = step.phase === "mystery" ? "mystery" : step.phase === "intro" ? "intro" : null;
  $("#beads-label").textContent = phase === "intro" ? "Contas das orações iniciais" : phase === "mystery" ? `Contas do ${step.globalMysteryIndex + 1}º mistério` : "Orações conclusivas";
  if (!phase) {
    const marker = document.createElement("span");
    marker.className = "bead bead-large";
    marker.dataset.state = "current";
    container.appendChild(marker);
    return;
  }

  const block = state.sequence.map((item, index) => ({ item, index })).filter(({ item }) =>
    item.phase === phase && (phase === "intro" || item.globalMysteryIndex === step.globalMysteryIndex) && ["pater", "ave", "gloria"].includes(item.type)
  );
  for (const { item, index } of block) {
    const bead = document.createElement("button");
    bead.type = "button";
    bead.className = `bead ${item.type === "pater" ? "bead-large" : ""} ${item.type === "gloria" ? "bead-square" : ""}`;
    bead.dataset.state = index === state.index ? "current" : index < state.index ? "done" : "pending";
    bead.setAttribute("aria-label", item.type === "ave" ? `Ave-Maria ${item.aveIndex}` : PRAYERS[item.type].title.pt);
    bead.addEventListener("click", () => jumpTo(index));
    container.appendChild(bead);
  }
}

async function nextStep() {
  if (state.index >= state.sequence.length - 1) {
    const agendaContext = state.agendaContext;
    state.agendaContext = null;
    clearProgress();
    if (agendaContext?.taskId && agendaController) await agendaController.completeTask(agendaContext.taskId, agendaContext.date, true);
    showConfirm("Oração concluída", "O progresso foi concluído. Deseja voltar ao início?", () => goHome());
    return;
  }
  state.index += 1;
  renderPrayerScreen();
  saveProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function previousStep() {
  if (state.index === 0) return;
  state.index -= 1;
  renderPrayerScreen();
  saveProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function jumpTo(index) {
  if (index < 0 || index >= state.sequence.length) return;
  state.index = index;
  closeDialog($("#navigation-dialog"));
  renderPrayerScreen();
  saveProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function jumpToMystery(globalMysteryIndex) {
  jumpTo(state.sequence.findIndex((step) => step.type === "mystery" && step.globalMysteryIndex === globalMysteryIndex));
}

function renderNavigation() {
  const current = state.sequence[state.index];
  const list = $("#navigation-mysteries");
  list.innerHTML = "";
  state.sequence.filter((step) => step.type === "mystery").forEach((step) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "navigation-item";
    button.dataset.state = current.globalMysteryIndex === step.globalMysteryIndex ? "current" : "";
    button.innerHTML = `<span>${String(step.globalMysteryIndex + 1).padStart(2, "0")}</span><span>${step.mystery.title.pt}</span>`;
    button.addEventListener("click", () => jumpToMystery(step.globalMysteryIndex));
    list.appendChild(button);
  });

  const section = $("#navigation-beads-section");
  const grid = $("#navigation-beads");
  const hasDecade = current.phase === "mystery";
  section.classList.toggle("hidden", !hasDecade);
  grid.innerHTML = "";
  if (!hasDecade) return;
  for (let number = 1; number <= 10; number++) {
    const index = state.sequence.findIndex((step) => step.type === "ave" && step.globalMysteryIndex === current.globalMysteryIndex && step.aveIndex === number);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = number;
    button.dataset.state = index === state.index ? "current" : "";
    button.addEventListener("click", () => jumpTo(index));
    grid.appendChild(button);
  }
}

function renderLibrary(query = "") {
  const primary = preferences.language;
  const secondary = primary === "pt" ? "la" : "pt";
  const normalized = normalize(query);
  const list = $("#prayer-library-list");
  list.innerHTML = "";
  for (const key of LIBRARY_ORDER) {
    const prayer = PRAYERS[key];
    if (normalized && !normalize(`${prayer.title.pt} ${prayer.title.la} ${prayer.text.pt} ${prayer.text.la}`).includes(normalized)) continue;
    const details = document.createElement("details");
    details.className = "library-prayer";
    const summary = document.createElement("summary");
    const title = document.createElement("span");
    title.className = "library-prayer-title";
    title.innerHTML = `<strong>${prayer.title[primary]}</strong><small>${prayer.title[secondary]}</small>`;
    summary.appendChild(title);
    const body = document.createElement("div");
    body.className = "library-prayer-body";
    body.innerHTML = `<p class="language-caption">${primary === "pt" ? "Português" : "Latim"}</p><p class="library-text"></p><p class="language-caption">${secondary === "pt" ? "Português" : "Latim"}</p><p class="library-text library-translation"></p>`;
    $$(".library-text", body)[0].textContent = prayer.text[primary];
    $$(".library-text", body)[1].textContent = prayer.text[secondary];
    details.append(summary, body);
    list.appendChild(details);
  }
  if (!list.children.length) list.innerHTML = '<p class="page-intro">Nenhuma oração encontrada.</p>';
}

function normalize(value) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function openSettings() {
  syncSettingsControls();
  openDialog($("#settings-dialog"), $("#btn-close-settings"));
}

function syncSettingsControls() {
  $$(".segmented[data-setting]").forEach((group) => {
    const key = group.dataset.setting;
    $$('button[data-value]', group).forEach((button) => button.setAttribute("aria-checked", String(button.dataset.value === preferences[key])));
  });
  $("#setting-translation").checked = preferences.translationDefault;
  $("#setting-focus").checked = preferences.focusMode;
  $("#setting-awake").checked = preferences.keepAwake;
}

function updatePreference(key, value) {
  preferences[key] = value;
  savePreferences();
  applyPreferences();
  syncSettingsControls();
  if (key === "keepAwake") preferences.keepAwake ? syncWakeLock() : releaseWakeLock();
  if (!$("#screen-pray").classList.contains("hidden")) renderPrayerScreen();
  if (!$("#screen-library").classList.contains("hidden")) renderLibrary($("#prayer-search").value);
}

function openDialog(layer, focusTarget) {
  lastFocusedElement = document.activeElement;
  layer.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => focusTarget?.focus());
}

function closeDialog(layer) {
  layer.classList.add("hidden");
  if (!$(".dialog-layer:not(.hidden)")) document.body.style.overflow = "";
  lastFocusedElement?.focus?.();
}

function closeAllDialogs() {
  $$(".dialog-layer").forEach((dialog) => dialog.classList.add("hidden"));
  document.body.style.overflow = "";
}

function showConfirm(title, message, callback) {
  confirmCallback = callback;
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  openDialog($("#confirm-dialog"), $("#btn-confirm-cancel"));
}

async function syncWakeLock() {
  if (!preferences.keepAwake || $("#screen-pray").classList.contains("hidden") || !("wakeLock" in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch {}
}

async function releaseWakeLock() {
  try { await wakeLock?.release(); } catch {}
  wakeLock = null;
}

function bindEvents() {
  $("#btn-santo-rosario").addEventListener("click", () => openSelection("rosario"));
  $("#btn-terco").addEventListener("click", () => openSelection("terco"));
  $("#btn-library").addEventListener("click", () => { renderLibrary(); showScreen("screen-library"); });
  $("#btn-start-full").addEventListener("click", () => startDevotion("rosario", null, 0, pendingAgendaContext));
  $("#btn-continue").addEventListener("click", continueDevotion);
  $("#btn-next").addEventListener("click", nextStep);
  $("#btn-prev").addEventListener("click", previousStep);
  $$('[data-home]').forEach((button) => button.addEventListener("click", () => goHome()));
  $$('[data-open-settings]').forEach((button) => button.addEventListener("click", openSettings));
  $("#btn-close-settings").addEventListener("click", () => closeDialog($("#settings-dialog")));

  $$(".segmented[data-setting]").forEach((group) => group.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (button) updatePreference(group.dataset.setting, button.dataset.value);
  }));
  $("#setting-translation").addEventListener("change", (event) => updatePreference("translationDefault", event.target.checked));
  $("#setting-focus").addEventListener("change", (event) => updatePreference("focusMode", event.target.checked));
  $("#setting-awake").addEventListener("change", (event) => updatePreference("keepAwake", event.target.checked));
  $("#btn-reset-settings").addEventListener("click", () => showConfirm("Restaurar configurações?", "Idioma, leitura e aparência voltarão aos padrões do Rosarium.", () => {
    preferences = { ...DEFAULT_PREFERENCES };
    savePreferences(); applyPreferences(); syncSettingsControls();
    if (!$("#screen-pray").classList.contains("hidden")) renderPrayerScreen();
  }));

  $("#btn-toggle-translation").addEventListener("click", () => {
    const panel = $("#translation-panel");
    const showing = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !showing);
    $("#btn-toggle-translation").setAttribute("aria-expanded", String(showing));
    $("#translation-label").textContent = showing ? "Ocultar tradução" : preferences.language === "pt" ? "Ver em latim" : "Ver em português";
  });

  $("#btn-open-navigation").addEventListener("click", () => { renderNavigation(); openDialog($("#navigation-dialog"), $("#btn-close-navigation")); });
  $("#btn-close-navigation").addEventListener("click", () => closeDialog($("#navigation-dialog")));
  $("#btn-navigation-home").addEventListener("click", () => goHome());
  $("#btn-restart").addEventListener("click", () => showConfirm("Reiniciar a oração?", "O progresso atual voltará para o Sinal da Cruz.", () => {
    state.index = 0; closeDialog($("#navigation-dialog")); renderPrayerScreen(); saveProgress();
  }));

  $("#btn-confirm-cancel").addEventListener("click", () => { confirmCallback = null; closeDialog($("#confirm-dialog")); });
  $("#btn-confirm-ok").addEventListener("click", () => {
    const callback = confirmCallback; confirmCallback = null; closeDialog($("#confirm-dialog")); callback?.();
  });
  $("#btn-about-home").addEventListener("click", () => openDialog($("#about-dialog"), $("#btn-close-about")));
  $("#btn-close-about").addEventListener("click", () => closeDialog($("#about-dialog")));
  $("#prayer-search").addEventListener("input", (event) => renderLibrary(event.target.value));

  $$(".dialog-layer").forEach((layer) => layer.addEventListener("click", (event) => {
    if (event.target === layer && layer.id !== "confirm-dialog") closeDialog(layer);
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const open = $(".dialog-layer:not(.hidden)");
      if (open && open.id !== "confirm-dialog") closeDialog(open);
      return;
    }
    if (!$("#screen-pray").classList.contains("hidden") && !$(".dialog-layer:not(.hidden)")) {
      if (event.key === "ArrowRight") nextStep();
      if (event.key === "ArrowLeft") previousStep();
    }
  });
  window.addEventListener("popstate", (event) => {
    closeAllDialogs();
    const id = event.state?.screen || "screen-home";
    showScreen(document.getElementById(id) ? id : "screen-home", false);
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncWakeLock(); });
}

function getCoreBackup() {
  return { preferences, progress: loadProgress() };
}

function restoreCoreBackup(application, mode) {
  if (application.preferences) {
    preferences = mode === "replace" ? { ...DEFAULT_PREFERENCES, ...application.preferences } : { ...preferences, ...application.preferences };
    savePreferences();
    applyPreferences();
    syncSettingsControls();
  }
  if (application.progress) localStorage.setItem(STORAGE.progress, JSON.stringify(application.progress));
  else if (mode === "replace") clearProgress();
  renderContinueCard();
}

function startAgendaPrayer(task, occurrenceDate) {
  const agendaContext = { taskId: task.id, date: occurrenceDate };
  if (task.prayerTarget === "rosario") startDevotion("rosario", null, 0, agendaContext);
  else if (task.prayerTarget === "terco") openSelection("terco", agendaContext);
  else if (task.prayerTarget === "library") {
    renderLibrary();
    showScreen("screen-library");
  }
}

async function init() {
  applyPreferences();
  bindEvents();
  renderContinueCard();
  history.replaceState({ screen: "screen-home" }, "", "");
  $(".progress-rail").classList.add("hidden");
  agendaController = await createAgendaController({
    showScreen,
    openDialog,
    closeDialog,
    showConfirm,
    getCoreBackup,
    restoreCoreBackup,
    onStartPrayer: startAgendaPrayer
  });
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
  const shortcut = new URLSearchParams(location.search).get("devotion");
  if (shortcut === "rosario" || shortcut === "terco") openSelection(shortcut);
  else if (new URLSearchParams(location.search).get("screen") === "agenda") await agendaController.open();
}

await init();
