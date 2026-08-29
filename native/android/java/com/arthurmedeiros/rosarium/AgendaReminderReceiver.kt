package com.arthurmedeiros.rosarium

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.Manifest
import android.content.pm.PackageManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.time.ZonedDateTime

class AgendaReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val taskId = intent.getStringExtra(AgendaScheduler.EXTRA_TASK_ID) ?: return
        val occurrenceDate = intent.getStringExtra(AgendaScheduler.EXTRA_OCCURRENCE_DATE) ?: return
        val task = AgendaScheduler.findTask(context, taskId) ?: return
        if (intent.action == AgendaScheduler.ACTION_COMPLETE) {
            saveCompletion(context, taskId, occurrenceDate)
            NotificationManagerCompat.from(context).cancel(AgendaScheduler.requestCode(taskId))
            return
        }
        showNotification(context, task, occurrenceDate)
        AgendaScheduler.schedule(context, task, ZonedDateTime.now().plusSeconds(15))
    }

    private fun showNotification(context: Context, task: JSONObject, occurrenceDate: String) {
        createChannel(context)
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val taskId = task.optString("id")
        val requestCode = AgendaScheduler.requestCode(taskId)
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(AgendaScheduler.EXTRA_TASK_ID, taskId)
            putExtra(AgendaScheduler.EXTRA_OCCURRENCE_DATE, occurrenceDate)
        }
        val openPendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_rosarium)
            .setContentTitle(task.optString("title", "Momento de oração"))
            .setContentText(if (task.optString("kind") == "reminder") "Lembrete do Rosarium" else "Seu compromisso de oração está marcado para agora.")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setContentIntent(openPendingIntent)
            .setAutoCancel(true)

        if (task.optString("kind") != "reminder") {
            val completeIntent = Intent(context, AgendaReminderReceiver::class.java).apply {
                action = AgendaScheduler.ACTION_COMPLETE
                putExtra(AgendaScheduler.EXTRA_TASK_ID, taskId)
                putExtra(AgendaScheduler.EXTRA_OCCURRENCE_DATE, occurrenceDate)
            }
            val completePending = PendingIntent.getBroadcast(
                context,
                requestCode xor 0x5f3759df,
                completeIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.addAction(0, "Marcar como rezada", completePending)
        }
        NotificationManagerCompat.from(context).notify(requestCode, builder.build())
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(CHANNEL_ID, "Agenda de oração", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Horários e compromissos programados no Rosarium"
        }
        manager.createNotificationChannel(channel)
    }

    private fun saveCompletion(context: Context, taskId: String, occurrenceDate: String) {
        val preferences = context.getSharedPreferences(AgendaScheduler.PREFERENCES, 0)
        val completions = try { JSONArray(preferences.getString(AgendaScheduler.PENDING_COMPLETIONS, "[]")) } catch (_: Exception) { JSONArray() }
        completions.put(JSONObject().put("taskId", taskId).put("date", occurrenceDate))
        preferences.edit().putString(AgendaScheduler.PENDING_COMPLETIONS, completions.toString()).apply()
    }

    companion object {
        private const val CHANNEL_ID = "rosarium_agenda"
    }
}
