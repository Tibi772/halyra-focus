package com.halyra.focus

import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * The blocking plan computed by the app (src/mobile/plan.js): exact time windows
 * plus daily limits. Evaluated here so blocking works while the UI is closed.
 */
class Plan(
    val generatedAt: Long,
    val windows: List<Window>,
    val limits: List<Limit>,
    val skips: Map<String, Long>,
    val block: JSONObject?,
) {
    class Window(val from: Long, val to: Long, val mode: String, val packages: Set<String>, val domains: Set<String>, val names: List<String>, val safe: Boolean = false, val standing: Boolean = false)
    class Limit(val id: String, val name: String, val limitSec: Long, val mode: String, val packages: Set<String>, val domains: Set<String>)

    class Active(
        val packages: Set<String>,
        val domains: Set<String>,
        val endsAt: Long?,
        val mode: String?,
        val limitPackages: Set<String>,
        val names: List<String>,
        val safe: Boolean = false,
        val focus: Boolean = true,
    ) {
        val any get() = packages.isNotEmpty() || domains.isNotEmpty() || safe
    }

    /** Package names that daily limits need usage numbers for. */
    val limitPackages: Set<String> get() = limits.flatMap { it.packages }.toSet()

    /** The next moment something starts, or null. */
    fun nextStart(now: Long): Long? = windows.filter { it.from > now }.minOfOrNull { it.from }

    fun hasFuture(now: Long): Boolean = limits.isNotEmpty() || windows.any { it.to > now }

    fun activeAt(now: Long, usageSec: Map<String, Long>): Active {
        val pk = LinkedHashSet<String>()
        val dm = LinkedHashSet<String>()
        val limPk = LinkedHashSet<String>()
        val names = ArrayList<String>()
        var ends = 0L
        var mode: String? = null
        var safe = false
        var focus = false
        for (w in windows) {
            if (w.from <= now && now < w.to) {
                pk.addAll(w.packages); dm.addAll(w.domains); names.addAll(w.names)
                if (w.safe) safe = true
                if (w.standing) continue // always-on lists: no end time, no mode
                focus = true
                ends = maxOf(ends, w.to)
                mode = stricter(mode, w.mode)
            }
        }
        // A focus window is split where an always-on/earn list changes; follow the chain to the real end.
        var moved = ends > 0
        while (moved) {
            moved = false
            for (w in windows) if (!w.standing && w.from <= ends && w.to > ends) { ends = w.to; moved = true }
        }
        for (l in limits) {
            val skip = skips[l.id]
            if (skip != null && skip > now) continue
            val used = l.packages.sumOf { usageSec[it] ?: 0L }
            if (used >= l.limitSec) {
                pk.addAll(l.packages); dm.addAll(l.domains); limPk.addAll(l.packages); names.add(l.name)
                focus = true
                ends = maxOf(ends, nextMidnight(now))
                mode = stricter(mode, l.mode)
            }
        }
        return Active(pk, dm, if (ends > 0) ends else null, mode, limPk, names, safe, focus)
    }

    companion object {
        private val RANK = mapOf("flexible" to 0, "patient" to 1, "strict" to 2)

        fun stricter(a: String?, b: String): String = if (a == null || (RANK[b] ?: 0) > (RANK[a] ?: 0)) b else a

        fun nextMidnight(now: Long): Long = Calendar.getInstance().run {
            timeInMillis = now
            add(Calendar.DAY_OF_YEAR, 1)
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            timeInMillis
        }

        private fun strings(a: JSONArray?): List<String> =
            if (a == null) emptyList() else (0 until a.length()).map { a.optString(it) }.filter { it.isNotEmpty() }

        fun parse(json: String?): Plan? {
            if (json.isNullOrBlank()) return null
            return try {
                val o = JSONObject(json)
                val ws = o.optJSONArray("windows") ?: JSONArray()
                val windows = (0 until ws.length()).map { i ->
                    val w = ws.getJSONObject(i)
                    Window(
                        w.optLong("from"), w.optLong("to"), w.optString("mode", "flexible"),
                        strings(w.optJSONArray("packages")).toSet(), strings(w.optJSONArray("domains")).map { it.lowercase() }.toSet(),
                        strings(w.optJSONArray("names")), w.optBoolean("safe", false), w.optBoolean("standing", false),
                    )
                }
                val ls = o.optJSONArray("limits") ?: JSONArray()
                val limits = (0 until ls.length()).map { i ->
                    val l = ls.getJSONObject(i)
                    Limit(
                        l.optString("id"), l.optString("name"), l.optLong("limitSec"), l.optString("mode", "patient"),
                        strings(l.optJSONArray("packages")).toSet(), strings(l.optJSONArray("domains")).map { it.lowercase() }.toSet(),
                    )
                }
                val sk = o.optJSONObject("skips")
                val skips = HashMap<String, Long>()
                if (sk != null) for (k in sk.keys()) skips[k] = sk.optLong(k)
                Plan(o.optLong("generatedAt"), windows, limits, skips, o.optJSONObject("block"))
            } catch (e: Exception) {
                null
            }
        }
    }
}
