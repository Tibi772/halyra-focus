package com.halyra.focus

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONObject

/** Hosts the shared Halyra Focus UI (same code as the desktop app) in a WebView. */
class MainActivity : Activity() {
    lateinit var web: WebView
    private lateinit var root: FrameLayout
    private var pendingCb: String? = null
    private var pendingFromSettings = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this)
        root.setBackgroundColor(Color.parseColor("#0A0D16"))
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        SystemBars.edgeToEdge(this, root)

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web.setBackgroundColor(Color.TRANSPARENT)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            textZoom = 100
            allowContentAccess = false
            setSupportZoom(false)
        }
        web.addJavascriptInterface(NativeBridge(this), "HalyraNative")
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val u = req.url
                if (u.scheme == "file") return false
                if (u.scheme == "https") openUrl(u.toString())
                return true
            }
        }
        web.loadUrl("file:///android_asset/www/renderer/index.html")
        if (Store.read(this, Store.PLAN) != null) FocusService.start(this)
    }

    override fun onResume() {
        super.onResume()
        visible = true
        web.onResume()
        web.resumeTimers()
        if (pendingFromSettings) { pendingFromSettings = false; resolvePending() }
        web.evaluateJavascript("window.__halyraResume && window.__halyraResume()", null)
    }

    override fun onPause() {
        visible = false
        web.onPause()
        web.pauseTimers()
        super.onPause()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("(window.__halyraBack && window.__halyraBack()) ? 'y' : 'n'") { r ->
            if (r == null || !r.contains("y")) moveTaskToBack(true)
        }
    }

    fun openUrl(url: String) {
        if (!url.startsWith("https://")) return
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { }
    }

    fun callback(id: String, json: String?) {
        runOnUiThread {
            web.evaluateJavascript("window.__halyraCallback(${JSONObject.quote(id)}, ${if (json == null) "null" else JSONObject.quote(json)})", null)
        }
    }

    fun setChrome(hex: String) {
        runOnUiThread { try { SystemBars.tint(this, root, Color.parseColor(hex)) } catch (_: Exception) { } }
    }

    private fun resolvePending() {
        val cb = pendingCb ?: return
        pendingCb = null
        callback(cb, Perms.json(this))
    }

    private fun openSettings(vararg intents: Intent) {
        for (i in intents) {
            try { startActivity(i); pendingFromSettings = true; return } catch (_: Exception) { }
        }
        resolvePending()
    }

    fun requestPermission(kind: String, cb: String) {
        resolvePending() // a previous request that never came back
        pendingCb = cb
        val pkgUri = Uri.parse("package:$packageName")
        when (kind) {
            "usage" -> openSettings(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, pkgUri), Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
            "overlay" -> openSettings(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkgUri), Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION))
            "battery" -> openSettings(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkgUri),
                Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
            )
            "notifications" -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF)
                } else {
                    openSettings(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
                }
            }
            "vpn" -> {
                val i = try { VpnService.prepare(this) } catch (_: Exception) { null }
                if (i == null) resolvePending()
                else try { startActivityForResult(i, REQ_VPN) } catch (_: Exception) { resolvePending() }
            }
            "privateDns" -> openSettings(Intent("android.settings.PRIVATE_DNS_SETTINGS"), Intent(Settings.ACTION_WIRELESS_SETTINGS))
            else -> resolvePending()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_VPN) {
            resolvePending()
            if (Store.read(this, Store.PLAN) != null) FocusService.start(this)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_NOTIF) resolvePending()
    }

    companion object {
        @Volatile var visible = false
        private const val REQ_VPN = 41
        private const val REQ_NOTIF = 42
    }
}
