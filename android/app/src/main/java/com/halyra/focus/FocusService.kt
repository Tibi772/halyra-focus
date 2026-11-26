package com.halyra.focus

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Enforces the plan: brings up the block screen over blocked apps and keeps the
 * website filter on while sites are blocked. Runs as a foreground service so
 * Android keeps it alive; sleeps until the next window when nothing is active.
 */
class FocusService : Service() {
    private val h = Handler(Looper.getMainLooper())
    private var plan: Plan? = null
    private var planMtime = -1L
    private lateinit var fg: Usage.Foreground
    private var usage: Map<String, Long> = emptyMap()
    private var usageAt = 0L
    private var lastLaunchPkg = ""
    private var lastLaunchAt = 0L
    private var lastNotifKey = ""
    private var wasActive = false
    private var lastTickAt = 0L
    private val allowed = HashSet<String>()

    private val loop = object : Runnable {
        override fun run() {
            val next = try { tick() } catch (e: Exception) { 2000L }
            h.removeCallbacks(this)
            h.postDelayed(this, next)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        fg = Usage.Foreground(this)
        allowed.addAll(listOf(packageName, "com.android.systemui", "com.android.phone", "com.android.dialer", "com.google.android.dialer",
            "com.samsung.android.dialer", "com.android.emergency", "com.google.android.apps.safetyhub", "com.android.incallui"))
        Apps.homePackage(this)?.let { allowed.add(it) }
        val n = buildNotification(null, System.currentTimeMillis())
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIF_ID, n)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        planMtime = -1L // reload
        h.removeCallbacks(loop)
        h.post(loop)
        return START_STICKY
    }

    override fun onDestroy() {
        h.removeCallbacks(loop)
        super.onDestroy()
    }

    private fun texts(): JSONObject? = plan?.block?.optJSONObject("texts")

    private fun tick(): Long {
        val now = System.currentTimeMillis()
        val mt = Store.mtime(this, Store.PLAN)
        if (mt != planMtime) { planMtime = mt; plan = Plan.parse(Store.read(this, Store.PLAN)) }
        val p = plan
        if (p == null || !p.hasFuture(now)) {
            DnsVpnService.stop(this)
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return 60_000L
        }
        // Daily limits: refresh usage often enough to catch the moment a limit runs out.
        if (p.limits.isNotEmpty() && now - usageAt > usageInterval(p)) {
            usage = Usage.today(this, p.limitPackages, now)
            usageAt = now
        }
        val a = p.activeAt(now, usage)

        if (a.domains.isNotEmpty()) DnsVpnService.update(this, a.domains) else DnsVpnService.stop(this)

        if (a.packages.isNotEmpty() && Usage.hasAccess(this)) {
            val cur = fg.current(now)
            if (cur != null && cur in a.packages && cur !in allowed) launchBlock(cur, a, now)
        }

        // Focus time while the app's own UI is closed (the UI counts it itself when open).
        val dt = if (lastTickAt > 0) minOf(10_000L, now - lastTickAt) else 0L
        lastTickAt = now
        val windowActive = p.windows.any { it.from <= now && now < it.to }
        if (windowActive && !MainActivity.visible && dt > 0) NativeStats.addFocus(this, now, dt)

        if (wasActive && !a.any) notifyEvent(texts()?.optString("ended").orEmpty().ifEmpty { "Halyra Focus" }, "")
        wasActive = a.any
        updateNotification(a, now)

        return when {
            a.packages.isNotEmpty() -> 450L
            a.domains.isNotEmpty() || p.limits.isNotEmpty() -> 3_000L
            else -> {
                val ns = p.nextStart(now)
                if (ns == null) 60_000L else (ns - now).coerceIn(500L, 60_000L)
            }
        }
    }

    private fun usageInterval(p: Plan): Long {
        // Closer to a limit → check more often (at most every 3 s).
        var minLeft = Long.MAX_VALUE
        for (l in p.limits) {
            val used = l.packages.sumOf { usage[it] ?: 0L }
            minLeft = minOf(minLeft, l.limitSec - used)
        }
        return when {
            minLeft <= 60 -> 3_000L
            minLeft <= 300 -> 10_000L
            else -> 20_000L
        }
    }

    private fun launchBlock(pkg: String, a: Plan.Active, now: Long) {
        if (pkg == lastLaunchPkg && now - lastLaunchAt < 1500 && BlockActivity.visible) return
        lastLaunchPkg = pkg
        lastLaunchAt = now
        val i = Intent(this, BlockActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(BlockActivity.EXTRA_PKG, pkg)
            .putExtra(BlockActivity.EXTRA_LABEL, Apps.label(this, pkg))
            .putExtra(BlockActivity.EXTRA_KIND, if (pkg in a.limitPackages) "limit" else "app")
            .putExtra(BlockActivity.EXTRA_ENDS, a.endsAt ?: 0L)
            .putExtra(BlockActivity.EXTRA_MODE, a.mode ?: "flexible")
        try { startActivity(i) } catch (_: Exception) {
            // Without "display over other apps" Android may refuse; fall back to the home screen.
            try { startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { }
        }
        if (now - (blockLog[pkg] ?: 0L) > 5_000L) {
            blockLog[pkg] = now
            NativeStats.addBlock(this, now, Apps.label(this, pkg))
        }
    }
    private val blockLog = HashMap<String, Long>()

    private fun fmt(ms: Long) = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(ms))

    private fun buildNotification(a: Plan.Active?, now: Long): Notification {
        val tx = texts()
        val title: String
        val text: String
        if (a != null && a.any) {
            title = tx?.optString("running").orEmpty().ifEmpty { "Focus is on" }
            val until = a.endsAt?.let { tx?.optString("until").orEmpty().ifEmpty { "until {time}" }.replace("{time}", fmt(it)) } ?: ""
            text = listOf(a.names.distinct().joinToString(", "), until).filter { it.isNotEmpty() }.joinToString(" · ")
        } else {
            title = "Halyra Focus"
            text = tx?.optString("watching").orEmpty().ifEmpty { "Ready" }
        }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, HalyraApp.CH_FOCUS)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setShowWhen(false)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification(a: Plan.Active, now: Long) {
        val key = "${a.any}|${a.endsAt}|${a.names}|${texts()?.optString("running")}"
        if (key == lastNotifKey) return
        lastNotifKey = key
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification(a, now))
    }

    private fun notifyEvent(title: String, body: String) {
        if (!Perms.notifications(this)) return
        val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, HalyraApp.CH_EVENTS)
            .setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(body).setContentIntent(open).setAutoCancel(true).build()
        getSystemService(NotificationManager::class.java).notify(EVENT_ID, n)
    }

    companion object {
        const val NOTIF_ID = 7
        const val EVENT_ID = 8

        fun start(ctx: Context) {
            try {
                ctx.startForegroundService(Intent(ctx, FocusService::class.java))
            } catch (_: Exception) {
                // Android refuses background starts without an exemption; the next app open starts it.
            }
        }

        /** Posts a notification on behalf of the web UI. */
        fun notifyFromUi(ctx: Context, title: String, body: String) {
            if (!Perms.notifications(ctx)) return
            val open = PendingIntent.getActivity(ctx, 2, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
            val n = Notification.Builder(ctx, HalyraApp.CH_EVENTS)
                .setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(body).setContentIntent(open).setAutoCancel(true).build()
            ctx.getSystemService(NotificationManager::class.java).notify(EVENT_ID, n)
        }
    }
}

/** Blocks and focus time recorded while the UI is closed; the UI merges them into its stats. */
object NativeStats {
    private const val FILE = "native-stats.json"

    @Synchronized private fun load(ctx: Context): JSONObject = try { JSONObject(Store.read(ctx, FILE) ?: "{}") } catch (_: Exception) { JSONObject() }

    @Synchronized fun addBlock(ctx: Context, ts: Long, name: String) {
        val o = load(ctx)
        val arr = o.optJSONArray("blocks") ?: JSONArray()
        if (arr.length() < 5000) arr.put(JSONArray().put(ts).put(name))
        o.put("blocks", arr)
        Store.write(ctx, FILE, o.toString())
    }

    @Synchronized fun addFocus(ctx: Context, ts: Long, ms: Long) {
        val o = load(ctx)
        val arr = o.optJSONArray("focus") ?: JSONArray()
        // Merge into the last entry when it is the same minute.
        val last = if (arr.length() > 0) arr.optJSONArray(arr.length() - 1) else null
        if (last != null && ts - last.optLong(0) < 60_000) last.put(1, last.optLong(1) + ms)
        else if (arr.length() < 20000) arr.put(JSONArray().put(ts).put(ms))
        o.put("focus", arr)
        Store.write(ctx, FILE, o.toString())
    }

    /** Returns and clears what was recorded. */
    @Synchronized fun take(ctx: Context): String {
        val s = Store.read(ctx, FILE) ?: "{}"
        Store.remove(ctx, FILE)
        return s
    }
}
