package com.arthurmedeiros.rosarium

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit
import kotlin.math.absoluteValue
import kotlin.math.min

object AgendaScheduler {
    const val PREFERENCES = "rosarium_agenda_native"
    const val SAVED_TASKS = "saved_tasks"
    const val PENDING_COMPLETIONS = "pending_completions"
    const val EXTRA_TASK_ID = "rosarium_task_id"
    const val EXTRA_OCCURRENCE_DATE = "rosarium_occurrence_date"
    const val ACTION_REMIND = "com.arthurmedeiros.rosarium.REMIND"
    const val ACTION_COMPLETE = "com.arthurmedeiros.rosarium.COMPLETE"

    fun sync(context: Context, tasks: JSONArray): Int {
        val preferences = context.getSharedPreferences(PREFERENCES, 0)
        val previous = parseArray(preferences.getString(SAVED_TASKS, "[]"))
        for (index in 0 until previous.length()) cancel(context, previous.optJSONObject(index)?.optString("id") ?: "")
        preferences.edit().putString(SAVED_TASKS, tasks.toString()).apply()
        var scheduled = 0
        for (index in 0 until tasks.length()) {
            val task = tasks.optJSONObject(index) ?: continue
            if (schedule(context, task, ZonedDateTime.now())) scheduled += 1
        }
        return scheduled
    }

    fun rescheduleAll(context: Context) {
        val saved = context.getSharedPreferences(PREFERENCES, 0).getString(SAVED_TASKS, "[]")
        val tasks = parseArray(saved)
        for (index in 0 until tasks.length()) {
            tasks.optJSONObject(index)?.let { schedule(context, it, ZonedDateTime.now()) }
        }
    }

    fun findTask(context: Context, taskId: String): JSONObject? {
        val saved = context.getSharedPreferences(PREFERENCES, 0).getString(SAVED_TASKS, "[]")
        val tasks = parseArray(saved)
        for (index in 0 until tasks.length()) {
            val task = tasks.optJSONObject(index) ?: continue
            if (task.optString("id") == taskId) return task
        }
        return null
    }

    fun schedule(context: Context, task: JSONObject, after: ZonedDateTime): Boolean {
        val id = task.optString("id")
        if (id.isBlank()) return false
        val next = nextAlarm(task, after) ?: return false
        val intent = Intent(context, AgendaReminderReceiver::class.java).apply {
            action = ACTION_REMIND
            putExtra(EXTRA_TASK_ID, id)
            putExtra(EXTRA_OCCURRENCE_DATE, next.second.toString())
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode(id),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.first.toInstant().toEpochMilli(), pendingIntent)
        return true
    }

    fun cancel(context: Context, taskId: String) {
        if (taskId.isBlank()) return
        val intent = Intent(context, AgendaReminderReceiver::class.java).apply { action = ACTION_REMIND }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode(taskId),
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        ) ?: return
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pendingIntent)
        pendingIntent.cancel()
    }

    fun requestCode(taskId: String): Int = taskId.hashCode().absoluteValue.coerceAtLeast(1)

    private fun nextAlarm(task: JSONObject, after: ZonedDateTime): Pair<ZonedDateTime, LocalDate>? {
        val startDate = parseDate(task.optString("startDate")) ?: return null
        val endDate = parseDate(task.optString("endDate"))
        val time = parseTime(task.optString("time")) ?: return null
        val reminderMinutes = task.optInt("reminderMinutes", 0).coerceAtLeast(0)
        var cursor = maxOf(after.toLocalDate(), startDate)
        repeat(3660) {
            if (endDate != null && cursor.isAfter(endDate)) return null
            if (occursOn(task, startDate, cursor)) {
                val event = ZonedDateTime.of(cursor, time, after.zone)
                val alarm = event.minusMinutes(reminderMinutes.toLong())
                if (alarm.isAfter(after.plusSeconds(5))) return Pair(alarm, cursor)
            }
            cursor = cursor.plusDays(1)
        }
        return null
    }

    private fun occursOn(task: JSONObject, start: LocalDate, date: LocalDate): Boolean {
        if (date.isBefore(start)) return false
        if (task.optString("kind") != "reminder") {
            val completedDates = task.optJSONArray("completedDates") ?: JSONArray()
            for (index in 0 until completedDates.length()) if (completedDates.optString(index) == date.toString()) return false
        }
        val recurrence = task.optJSONObject("recurrence") ?: JSONObject().put("type", "none")
        val type = recurrence.optString("type", "none")
        val interval = recurrence.optInt("interval", 1).coerceAtLeast(1)
        return when (type) {
            "none" -> date == start
            "daily" -> ChronoUnit.DAYS.between(start, date) % interval == 0L
            "weekly" -> {
                val weekdays = recurrence.optJSONArray("weekdays") ?: JSONArray().put(start.dayOfWeek.androidDay())
                var selected = false
                for (index in 0 until weekdays.length()) if (weekdays.optInt(index) == date.dayOfWeek.androidDay()) selected = true
                selected && (ChronoUnit.DAYS.between(start, date) / 7) % interval == 0L
            }
            "monthly" -> {
                val targetDay = min(start.dayOfMonth, date.lengthOfMonth())
                date.dayOfMonth == targetDay && ChronoUnit.MONTHS.between(start.withDayOfMonth(1), date.withDayOfMonth(1)) % interval == 0L
            }
            "yearly" -> {
                val targetDay = min(start.dayOfMonth, date.lengthOfMonth())
                date.month == start.month && date.dayOfMonth == targetDay && (date.year - start.year) % interval == 0
            }
            else -> false
        }
    }

    private fun DayOfWeek.androidDay(): Int = value % 7
    private fun parseDate(value: String): LocalDate? = try { if (value.isBlank()) null else LocalDate.parse(value) } catch (_: Exception) { null }
    private fun parseTime(value: String): LocalTime? = try { if (value.isBlank()) null else LocalTime.parse(value) } catch (_: Exception) { null }
    private fun parseArray(value: String?): JSONArray = try { JSONArray(value ?: "[]") } catch (_: Exception) { JSONArray() }
}
