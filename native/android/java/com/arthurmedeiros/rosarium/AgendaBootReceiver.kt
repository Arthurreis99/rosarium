package com.arthurmedeiros.rosarium

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AgendaBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_TIME_CHANGED || intent.action == Intent.ACTION_TIMEZONE_CHANGED) {
            AgendaScheduler.rescheduleAll(context)
        }
    }
}
