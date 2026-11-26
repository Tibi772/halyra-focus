package com.halyra.focus

import android.content.Context
import java.io.File

/** Small private file store shared by the web UI (via the bridge) and the services. */
object Store {
    const val PLAN = "plan.json"
    private val safe = Regex("^[A-Za-z0-9._-]{1,80}$")

    private fun dir(ctx: Context): File = File(ctx.filesDir, "app").also { it.mkdirs() }

    private fun file(ctx: Context, name: String): File? =
        if (safe.matches(name) && name != "." && name != "..") File(dir(ctx), name) else null

    fun read(ctx: Context, name: String): String? = try {
        file(ctx, name)?.takeIf { it.exists() }?.readText()
    } catch (e: Exception) { null }

    fun write(ctx: Context, name: String, data: String): Boolean = try {
        val f = file(ctx, name) ?: return false
        val tmp = File(f.parentFile, "${f.name}.tmp")
        tmp.writeText(data)
        tmp.renameTo(f) || run { f.writeText(data); true }
    } catch (e: Exception) { false }

    fun remove(ctx: Context, name: String): Boolean = file(ctx, name)?.delete() ?: false

    fun mtime(ctx: Context, name: String): Long = file(ctx, name)?.lastModified() ?: 0L
}
