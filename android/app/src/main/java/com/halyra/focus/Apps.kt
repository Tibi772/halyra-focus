package com.halyra.focus

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

object Apps {
    fun label(ctx: Context, pkg: String): String = try {
        val pm = ctx.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (_: Exception) { pkg }

    /**
     * Launchers (home screens) — never blocked, so the user can always get back home.
     * Settings registers a fallback home screen used during boot; it is not a launcher.
     */
    fun homePackages(ctx: Context): Set<String> = try {
        val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        ctx.packageManager.queryIntentActivities(i, 0).map { it.activityInfo.packageName }
            .filter { it != "android" && it != "com.android.settings" && !it.endsWith(".provision") }.toSet()
    } catch (_: Exception) { emptySet() }

    /** Launchable apps with small PNG icons, for the block-list app picker. */
    fun listJson(ctx: Context): String {
        val pm = ctx.packageManager
        val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val out = JSONArray()
        val seen = HashSet<String>()
        for (ri in pm.queryIntentActivities(main, 0)) {
            val pkg = ri.activityInfo.packageName
            if (pkg == ctx.packageName || !seen.add(pkg)) continue
            val o = JSONObject().put("pkg", pkg).put("name", ri.loadLabel(pm).toString())
            try {
                val d = ri.loadIcon(pm)
                val size = 72
                val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
                val c = Canvas(bmp)
                d.setBounds(0, 0, size, size)
                d.draw(c)
                val bos = ByteArrayOutputStream()
                bmp.compress(Bitmap.CompressFormat.PNG, 100, bos)
                o.put("icon", "data:image/png;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP))
            } catch (_: Exception) { }
            out.put(o)
        }
        return out.toString()
    }
}
