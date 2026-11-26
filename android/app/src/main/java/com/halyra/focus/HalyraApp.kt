package com.halyra.focus

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager

class HalyraApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CH_FOCUS, getString(R.string.channel_focus), NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_EVENTS, getString(R.string.channel_events), NotificationManager.IMPORTANCE_DEFAULT)
        )
        // Keep blocking after an app update / when the process restarts.
        if (Store.read(this, Store.PLAN) != null) FocusService.start(this)
    }

    companion object {
        const val CH_FOCUS = "focus"
        const val CH_EVENTS = "events"
    }
}
