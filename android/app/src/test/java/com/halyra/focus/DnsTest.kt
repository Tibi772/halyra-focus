package com.halyra.focus

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DnsTest {
    private fun addr(a: Int, b: Int, c: Int, d: Int) = byteArrayOf(a.toByte(), b.toByte(), c.toByte(), d.toByte())

    /** Builds an IPv4/UDP/DNS query packet like an app's resolver would send. */
    private fun query(name: String, type: Int, id: Int = 0x1234): ByteArray {
        val qname = name.split('.').flatMap { listOf(it.length.toByte()) + it.toByteArray().toList() } + listOf(0.toByte())
        val dns = byteArrayOf((id ushr 8).toByte(), id.toByte(), 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0) +
            qname.toByteArray() + byteArrayOf((type ushr 8).toByte(), type.toByte(), 0, 1)
        val total = 28 + dns.size
        val ip = ByteArray(28)
        ip[0] = 0x45; ip[2] = (total ushr 8).toByte(); ip[3] = total.toByte(); ip[8] = 64; ip[9] = 17
        addr(10, 111, 222, 1).copyInto(ip, 12); addr(10, 111, 222, 2).copyInto(ip, 16)
        ip[20] = (40000 ushr 8).toByte(); ip[21] = 40000.toByte(); ip[22] = 0; ip[23] = 53
        ip[24] = ((8 + dns.size) ushr 8).toByte(); ip[25] = (8 + dns.size).toByte()
        return ip + dns
    }

    @Test fun parsesQuery() {
        val p = query("www.YouTube.com", Dns.TYPE_A)
        val q = Dns.parse(p, p.size)
        assertNotNull(q)
        assertEquals("www.youtube.com", q!!.name)
        assertEquals(Dns.TYPE_A, q.type)
        assertEquals(0x1234, q.id)
        assertEquals(40000, q.srcPort)
    }

    @Test fun ignoresNonDns() {
        val p = query("example.org", Dns.TYPE_A)
        p[23] = 80 // not port 53
        assertEquals(null, Dns.parse(p, p.size))
        assertEquals(null, Dns.parse(ByteArray(10), 10))
    }

    @Test fun matchesSubdomainsOnly() {
        val set = setOf("youtube.com", "x.com")
        assertTrue(Dns.matches("m.youtube.com", set))
        assertTrue(Dns.matches("youtube.com.", set))
        assertTrue(Dns.matches("x.com", set))
        assertFalse(Dns.matches("notyoutube.com", set))
        assertFalse(Dns.matches("box.com", set))
        assertFalse(Dns.matches("com", set))
    }

    @Test fun blockedAnswerIsZeroAddress() {
        val p = query("tiktok.com", Dns.TYPE_A, 0x0BAD)
        val q = Dns.parse(p, p.size)!!
        val ans = Dns.blockedAnswer(q)
        assertEquals(0x0B, ans[0].toInt()); assertEquals(0xAD, ans[1].toInt() and 0xFF)
        assertTrue((ans[2].toInt() and 0x80) != 0) // response
        assertEquals(0, ans[3].toInt() and 0x0F)    // NOERROR
        assertEquals(1, ans[7].toInt())             // one answer
        val tail = ans.copyOfRange(ans.size - 4, ans.size)
        assertArrayEquals(byteArrayOf(0, 0, 0, 0), tail)
        val p6 = query("tiktok.com", Dns.TYPE_AAAA)
        val aaaa = Dns.blockedAnswer(Dns.parse(p6, p6.size)!!)
        assertEquals(16, aaaa[aaaa.size - 17].toInt()) // rdlength low byte before 16 zero bytes
        val nx = Dns.blockedAnswer(q, nxdomain = true)
        assertEquals(3, nx[3].toInt() and 0x0F)
        assertEquals(0, nx[7].toInt())
    }

    @Test fun replyPacketIsValidIpv4() {
        val p = query("reddit.com", Dns.TYPE_A)
        val q = Dns.parse(p, p.size)!!
        val r = Dns.reply(q, Dns.blockedAnswer(q))
        assertEquals(0x45, r[0].toInt())
        assertEquals(r.size, ((r[2].toInt() and 0xFF) shl 8) or (r[3].toInt() and 0xFF))
        // addresses and ports are swapped
        assertArrayEquals(addr(10, 111, 222, 2), r.copyOfRange(12, 16))
        assertArrayEquals(addr(10, 111, 222, 1), r.copyOfRange(16, 20))
        assertEquals(53, ((r[20].toInt() and 0xFF) shl 8) or (r[21].toInt() and 0xFF))
        assertEquals(40000, ((r[22].toInt() and 0xFF) shl 8) or (r[23].toInt() and 0xFF))
        // header checksum verifies to 0xFFFF
        var sum = 0
        for (i in 0 until 20 step 2) sum += ((r[i].toInt() and 0xFF) shl 8) or (r[i + 1].toInt() and 0xFF)
        while (sum ushr 16 != 0) sum = (sum and 0xFFFF) + (sum ushr 16)
        assertEquals(0xFFFF, sum)
    }
}
