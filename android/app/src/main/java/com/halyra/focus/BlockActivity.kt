package com.halyra.focus

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONObject

/** Full-screen block page shown over a blocked app (same themes as the app, retro ones included). */
class BlockActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private var loaded = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this)
        root.setBackgroundColor(Color.parseColor("#0A0D16"))
        web = WebView(this)
        web.setBackgroundColor(Color.TRANSPARENT)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        SystemBars.edgeToEdge(this, root)
        web.settings.javaScriptEnabled = true
        web.settings.textZoom = 100
        web.addJavascriptInterface(Bridge(), "HalyraBlock")
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) { loaded = true; render() }
        }
        web.loadUrl("file:///android_asset/www/renderer/block.html")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (loaded) render()
    }

    override fun onResume() {
        super.onResume()
        visible = true
        web.resumeTimers()
    }

    override fun onPause() {
        visible = false
        super.onPause()
    }

    private fun render() {
        val plan = Plan.parse(Store.read(this, Store.PLAN))
        val data = JSONObject()
            .put("app", intent.getStringExtra(EXTRA_LABEL) ?: "")
            .put("kind", intent.getStringExtra(EXTRA_KIND) ?: "app")
            .put("endsAt", intent.getLongExtra(EXTRA_ENDS, 0L))
            .put("mode", intent.getStringExtra(EXTRA_MODE) ?: "flexible")
            .put("block", plan?.block ?: JSONObject())
        web.evaluateJavascript("window.halyraBlock && window.halyraBlock(${data})", null)
        val bg = plan?.block?.optJSONObject("vars")?.optString("--bg")
        try { SystemBars.tint(this, root, Color.parseColor(if (bg.isNullOrEmpty()) themeBg(plan?.block?.optString("theme")) else bg)) } catch (_: Exception) { }
    }

    private fun themeBg(theme: String?) = when (theme) {
        "daylight" -> "#F4F1EA"; "crt" -> "#030603"; "onebit" -> "#FFFFFF"; "vapor" -> "#1B0B30"; else -> "#0A0D16"
    }

    private fun goHome() {
        try { startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { }
        finish()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { goHome() }

    inner class Bridge {
        @JavascriptInterface fun home() { runOnUiThread { goHome() } }
        @JavascriptInterface fun open() {
            runOnUiThread {
                startActivity(Intent(this@BlockActivity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                finish()
            }
        }
    }

    companion object {
        @Volatile var visible = false
        const val EXTRA_PKG = "pkg"
        const val EXTRA_LABEL = "label"
        const val EXTRA_KIND = "kind"
        const val EXTRA_ENDS = "endsAt"
        const val EXTRA_MODE = "mode"
    }
}
