package com.halyra.focus

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Process
import java.util.Calendar

object Usage {
    private const val RESUMED = 1 // UsageEvents.Event.ACTIVITY_RESUMED (= MOVE_TO_FOREGROUND)
    private const val PAUSED = 2  // ACTIVITY_PAUSED (= MOVE_TO_BACKGROUND)
    private const val STOPPED = 23

    fun hasAccess(ctx: Context): Boolean = try {
        val ops = ctx.getSystemService(AppOpsManager::class.java)
        val mode = if (Build.VERSION.SDK_INT >= 29) ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        else @Suppress("DEPRECATION") ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        mode == AppOpsManager.MODE_ALLOWED
    } catch (_: Exception) { false }

    fun startOfDay(now: Long): Long = Calendar.getInstance().run {
        timeInMillis = now
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        timeInMillis
    }

    /** Seconds each package has been in the foreground today. */
    fun today(ctx: Context, pkgs: Set<String>, now: Long = System.currentTimeMillis()): Map<String, Long> {
        if (pkgs.isEmpty() || !hasAccess(ctx)) return emptyMap()
        val usm = ctx.getSystemService(UsageStatsManager::class.java) ?: return emptyMap()
        val open = HashMap<String, Long>()
        val total = HashMap<String, Long>()
        try {
            val events = usm.queryEvents(startOfDay(now), now)
            val e = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(e)
                val p = e.packageName ?: continue
                if (p !in pkgs) continue
                when (e.eventType) {
                    RESUMED -> if (!open.containsKey(p)) open[p] = e.timeStamp
                    PAUSED, STOPPED -> open.remove(p)?.let { total[p] = (total[p] ?: 0L) + (e.timeStamp - it) }
                }
            }
        } catch (_: Exception) { }
        for ((p, st) in open) total[p] = (total[p] ?: 0L) + (now - st)
        return total.mapValues { it.value / 1000 }
    }

    /** Follows which app is in front, reading only new usage events each time. */
    class Foreground(ctx: Context) {
        private val usm = ctx.getSystemService(UsageStatsManager::class.java)
        private var last: String? = null
        private var lastTs = 0L
        private var queried = 0L

        fun current(now: Long = System.currentTimeMillis()): String? {
            val from = if (queried == 0L) now - 10 * 60_000 else queried - 3_000
            try {
                val events = usm.queryEvents(from, now)
                val e = UsageEvents.Event()
                while (events.hasNextEvent()) {
                    events.getNextEvent(e)
                    if (e.eventType == RESUMED && e.timeStamp >= lastTs) { last = e.packageName; lastTs = e.timeStamp }
                }
            } catch (_: Exception) { }
            queried = now
            return last
        }
    }
}
