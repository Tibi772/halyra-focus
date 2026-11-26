package com.halyra.focus

import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * What the shared app code (src/mobile/shims/native.js) can ask the phone for.
 * Calls arrive on a background thread; anything touching the UI hops to it.
 */
class NativeBridge(private val act: MainActivity) {
    @JavascriptInterface fun readFile(name: String): String? = Store.read(act, name)
    @JavascriptInterface fun writeFile(name: String, data: String): Boolean = Store.write(act, name, data)
    @JavascriptInterface fun removeFile(name: String): Boolean = Store.remove(act, name)

    @JavascriptInterface fun locale(): String = Locale.getDefault().toLanguageTag()
    @JavascriptInterface fun appVersion(): String = BuildConfig.VERSION_NAME

    /** PIN hashing (PBKDF2-HMAC-SHA256); the hash never leaves this phone. */
    @JavascriptInterface fun kdf(password: String, salt: String, len: Int): String {
        val spec = PBEKeySpec(password.toCharArray(), salt.toByteArray(Charsets.UTF_8), 120_000, len.coerceIn(16, 64) * 8)
        val bytes = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        return bytes.joinToString("") { "%02x".format(it) }
    }

    @JavascriptInterface fun permissions(): String = Perms.json(act)
    @JavascriptInterface fun requestPermission(kind: String, cb: String) { act.runOnUiThread { act.requestPermission(kind, cb) } }

    @JavascriptInterface fun installedApps(cb: String) {
        Thread { act.callback(cb, try { Apps.listJson(act) } catch (_: Exception) { "[]" }) }.start()
    }

    @JavascriptInterface fun usageToday(pkgsJson: String): String {
        val arr = try { JSONArray(pkgsJson) } catch (_: Exception) { JSONArray() }
        val set = (0 until arr.length()).map { arr.optString(it) }.filter { it.isNotEmpty() }.toSet()
        val out = JSONObject()
        for ((k, v) in Usage.today(act, set)) out.put(k, v)
        return out.toString()
    }

    @JavascriptInterface fun setPlan(json: String): Boolean {
        if (Plan.parse(json) == null) return false
        val ok = Store.write(act, Store.PLAN, json)
        FocusService.start(act)
        return ok
    }

    @JavascriptInterface fun takeStats(): String = NativeStats.take(act)
    @JavascriptInterface fun notify(title: String, body: String) { FocusService.notifyFromUi(act, title, body) }
    @JavascriptInterface fun openUrl(url: String): Boolean { act.runOnUiThread { act.openUrl(url) }; return true }
    @JavascriptInterface fun setChrome(color: String) { act.setChrome(color) }
    @JavascriptInterface fun moveToBack() { act.runOnUiThread { act.moveTaskToBack(true) } }
}
