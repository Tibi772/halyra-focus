package com.halyra.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlanTest {
    private val now = 1_800_000_000_000L
    private val json = """
        {"v":1,"generatedAt":$now,
         "windows":[{"from":${now - 1000},"to":${now + 60_000},"mode":"patient","packages":["com.instagram.android"],"domains":["instagram.com"],"ids":["session"],"names":["Munka"]},
                    {"from":${now + 3_600_000},"to":${now + 7_200_000},"mode":"strict","packages":["com.zhiliaoapp.musically"],"domains":["tiktok.com"],"ids":["s1"],"names":[]}],
         "limits":[{"id":"limit:v","listId":"v","name":"Videó","limitSec":1800,"mode":"strict","packages":["com.google.android.youtube"],"domains":["youtube.com"]}],
         "skips":{}, "block":{"texts":{"title":"Most tiltva van"}}}
    """.trimIndent()

    @Test fun parsesAndEvaluatesWindows() {
        val p = Plan.parse(json)
        assertNotNull(p)
        val a = p!!.activeAt(now, emptyMap())
        assertTrue("com.instagram.android" in a.packages)
        assertTrue("instagram.com" in a.domains)
        assertFalse("com.zhiliaoapp.musically" in a.packages)
        assertEquals("patient", a.mode)
        assertEquals(now + 60_000, a.endsAt)
        assertEquals(now + 3_600_000, p.nextStart(now))
        val later = p.activeAt(now + 3_700_000, emptyMap())
        assertEquals("strict", later.mode)
        assertTrue("tiktok.com" in later.domains)
    }

    @Test fun limitsBlockOnceUsedUpUnlessSkipped() {
        val p = Plan.parse(json)!!
        assertFalse("com.google.android.youtube" in p.activeAt(now, mapOf("com.google.android.youtube" to 1799L)).packages)
        val a = p.activeAt(now, mapOf("com.google.android.youtube" to 1800L))
        assertTrue("com.google.android.youtube" in a.packages)
        assertTrue("com.google.android.youtube" in a.limitPackages)
        assertEquals("strict", a.mode)
        val skipped = Plan.parse(json.replace("\"skips\":{}", "\"skips\":{\"limit:v\":${now + 10_000}}"))!!
        assertFalse("com.google.android.youtube" in skipped.activeAt(now, mapOf("com.google.android.youtube" to 5000L)).packages)
    }

    @Test fun standingWindowsBlockWithoutEndOrFocus() {
        val forever = 8_640_000_000_000_000L
        val sj = """{"v":1,"generatedAt":$now,"windows":[{"from":$now,"to":$forever,"mode":"flexible","packages":[],"domains":["pornhub.com"],"ids":["list:adult"],"names":["Felnőtt tartalom"],"safe":true,"standing":true}],"limits":[],"skips":{}}"""
        val p = Plan.parse(sj)!!
        val a = p.activeAt(now + 400L * 24 * 3600 * 1000, emptyMap())
        assertTrue("pornhub.com" in a.domains)
        assertTrue(a.safe)
        assertTrue(a.any)
        assertFalse(a.focus)
        assertNull(a.endsAt)
        assertNull(a.mode)
        assertTrue(p.hasFuture(now))
    }

    @Test fun rejectsGarbage() {
        assertNull(Plan.parse("not json"))
        assertNull(Plan.parse(""))
        val empty = Plan.parse("{}")!!
        assertFalse(empty.hasFuture(now))
        assertFalse(empty.activeAt(now, emptyMap()).any)
    }
}
