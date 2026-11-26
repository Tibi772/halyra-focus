package com.halyra.focus

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Blocking resumes after a restart or an app update without opening the app. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (Store.read(ctx, Store.PLAN) != null) FocusService.start(ctx)
    }
}
