package com.arthurmedeiros.rosarium

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray

@CapacitorPlugin(
    name = "RosariumAgenda",
    permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])]
)
class RosariumAgendaPlugin : Plugin() {
    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        val result = JSObject()
        result.put("native", true)
        result.put("filePicker", true)
        result.put("notifications", notificationPermission())
        result.put("exactAlarms", AgendaScheduler.exactAlarmStatus(context))
        call.resolve(result)
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            resolvePermission(call)
            return
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback")
    }

    @PermissionCallback
    private fun notificationPermissionCallback(call: PluginCall) {
        resolvePermission(call)
    }

    private fun resolvePermission(call: PluginCall) {
        val result = JSObject()
        result.put("permission", notificationPermission())
        call.resolve(result)
    }

    private fun notificationPermission(): String {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return "denied"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) return "denied"
        return "granted"
    }

    @PluginMethod
    fun requestExactAlarmPermission(call: PluginCall) {
        val status = AgendaScheduler.exactAlarmStatus(context)
        if (status != "denied" || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            val result = JSObject()
            result.put("exactAlarms", status)
            call.resolve(result)
            return
        }
        try {
            val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            activity.startActivity(intent)
            val result = JSObject()
            result.put("exactAlarms", "settings")
            call.resolve(result)
        } catch (error: Exception) {
            call.reject("Não foi possível abrir o acesso a alarmes e lembretes.", error)
        }
    }

    @PluginMethod
    fun syncReminders(call: PluginCall) {
        val tasks = call.getArray("tasks", JSArray()) ?: JSArray()
        val scheduled = AgendaScheduler.sync(context, tasks)
        val result = JSObject()
        result.put("native", true)
        result.put("scheduled", scheduled)
        result.put("permission", notificationPermission())
        result.put("exactAlarms", AgendaScheduler.exactAlarmStatus(context))
        call.resolve(result)
    }

    @PluginMethod
    fun exportBackup(call: PluginCall) {
        val content = call.getString("content")
        val fileName = call.getString("fileName", "Rosarium-backup.json")
        if (content.isNullOrBlank()) {
            call.reject("O backup está vazio.")
            return
        }
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/json"
            putExtra(Intent.EXTRA_TITLE, fileName)
        }
        startActivityForResult(call, intent, "exportBackupResult")
    }

    @ActivityCallback
    private fun exportBackupResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) {
            call.reject("Operação cancelada.")
            return
        }
        try {
            val uri = result.data!!.data!!
            context.contentResolver.openOutputStream(uri, "w")!!.use { output ->
                output.write((call.getString("content") ?: "").toByteArray(Charsets.UTF_8))
            }
            val response = JSObject()
            response.put("exported", true)
            response.put("fileName", call.getString("fileName", "Rosarium-backup.json"))
            call.resolve(response)
        } catch (error: Exception) {
            call.reject("Não foi possível gravar o backup.", error)
        }
    }

    @PluginMethod
    fun importBackup(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/json"
        }
        startActivityForResult(call, intent, "importBackupResult")
    }

    @ActivityCallback
    private fun importBackupResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) {
            call.reject("Operação cancelada.")
            return
        }
        try {
            val uri = result.data!!.data!!
            val content = context.contentResolver.openInputStream(uri)!!.bufferedReader(Charsets.UTF_8).use { it.readText() }
            if (content.length > 5_000_000) {
                call.reject("O arquivo excede o limite de 5 MB.")
                return
            }
            var fileName = "Rosarium-backup.json"
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) fileName = cursor.getString(0)
            }
            val response = JSObject()
            response.put("fileName", fileName)
            response.put("content", content)
            call.resolve(response)
        } catch (error: Exception) {
            call.reject("Não foi possível ler o backup.", error)
        }
    }

    @PluginMethod
    fun consumePendingActions(call: PluginCall) {
        val response = JSObject()
        val launchIntent = activity.intent
        response.put("launchTaskId", launchIntent?.getStringExtra(AgendaScheduler.EXTRA_TASK_ID))
        response.put("launchDate", launchIntent?.getStringExtra(AgendaScheduler.EXTRA_OCCURRENCE_DATE))
        launchIntent?.removeExtra(AgendaScheduler.EXTRA_TASK_ID)
        launchIntent?.removeExtra(AgendaScheduler.EXTRA_OCCURRENCE_DATE)

        val preferences = context.getSharedPreferences(AgendaScheduler.PREFERENCES, 0)
        val raw = preferences.getString(AgendaScheduler.PENDING_COMPLETIONS, "[]") ?: "[]"
        val completions = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
        preferences.edit().putString(AgendaScheduler.PENDING_COMPLETIONS, "[]").apply()
        response.put("completions", completions)
        call.resolve(response)
    }
}
