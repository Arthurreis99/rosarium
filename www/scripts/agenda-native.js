function nativePlugin() {
  return globalThis.Capacitor?.Plugins?.RosariumAgenda || null;
}

export async function agendaCapabilities() {
  const plugin = nativePlugin();
  if (!plugin) return { native: false, notifications: "web", exactAlarms: "web", filePicker: false };
  try {
    return await plugin.getCapabilities();
  } catch {
    return { native: true, notifications: "unknown", exactAlarms: "unknown", filePicker: true };
  }
}

export async function syncNativeReminders(tasks, requestPermission = false) {
  const plugin = nativePlugin();
  if (!plugin) return { native: false, scheduled: 0, permission: "web", exactAlarms: "web" };
  let permission = "unknown";
  if (requestPermission) {
    try {
      const response = await plugin.requestNotificationPermission();
      permission = response.permission || "unknown";
    } catch {
      permission = "denied";
    }
  }
  const reminders = tasks.filter((task) => task.notificationEnabled && task.time).map((task) => ({
    id: task.id,
    title: task.title,
    kind: task.kind,
    startDate: task.startDate,
    endDate: task.endDate || "",
    time: task.time,
    reminderMinutes: Number(task.reminderMinutes) || 0,
    recurrence: task.recurrence || { type: "none", interval: 1, weekdays: [] },
    prayerTarget: task.prayerTarget || "none",
    completedDates: Array.isArray(task.completedDates) ? task.completedDates : []
  }));
  try {
    const result = await plugin.syncReminders({ tasks: reminders, permission });
    if (requestPermission && result.permission === "granted" && result.exactAlarms === "denied") {
      try {
        const exactAccess = await plugin.requestExactAlarmPermission();
        return { ...result, exactAlarms: exactAccess.exactAlarms || result.exactAlarms };
      } catch {
        return { ...result, exactAlarms: "denied" };
      }
    }
    return result;
  } catch (error) {
    return { native: true, scheduled: 0, permission, exactAlarms: "unknown", error: error?.message || "Falha ao programar notificações." };
  }
}

export async function exportBackupFile(backup) {
  const content = JSON.stringify(backup, null, 2);
  const fileName = `Rosarium-backup-${backup.exportedAt.slice(0, 10)}.json`;
  const plugin = nativePlugin();
  if (plugin) return plugin.exportBackup({ fileName, content });

  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { fileName, exported: true };
}

export async function importBackupFile() {
  const plugin = nativePlugin();
  if (plugin) {
    const result = await plugin.importBackup();
    return { fileName: result.fileName || "backup.json", content: result.content };
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.hidden = true;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        reject(new Error("Nenhum arquivo foi selecionado."));
        return;
      }
      try {
        resolve({ fileName: file.name, content: await file.text() });
      } catch {
        reject(new Error("Não foi possível ler o arquivo selecionado."));
      }
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export async function consumeNativeAgendaActions() {
  const plugin = nativePlugin();
  if (!plugin) return { launchTaskId: null, launchDate: null, completions: [] };
  try {
    return await plugin.consumePendingActions();
  } catch {
    return { launchTaskId: null, launchDate: null, completions: [] };
  }
}
