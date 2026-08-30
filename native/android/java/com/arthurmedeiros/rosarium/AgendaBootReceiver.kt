package com.arthurmedeiros.rosarium

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class AgendaBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val exactAlarmAccessGranted = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            intent.action == AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_TIME_CHANGED || intent.action == Intent.ACTION_TIMEZONE_CHANGED || exactAlarmAccessGranted) {
            AgendaScheduler.rescheduleAll(context)
        }
    }
}
