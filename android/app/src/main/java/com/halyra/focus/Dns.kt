package com.halyra.focus

/** Minimal IPv4/UDP/DNS handling for the local website filter. Pure Kotlin, unit-tested. */
object Dns {
    const val TYPE_A = 1
    const val TYPE_AAAA = 28

    /** While sites are blocked, browsers must not bypass the filter with their own DNS-over-HTTPS. */
    val DOH_HOSTS = setOf(
        "dns.google", "cloudflare-dns.com", "one.one.one.one", "doh.opendns.com", "dns.quad9.net", "dns.nextdns.io",
        "doh.cleanbrowsing.org", "dns.adguard-dns.com", "doh.mullvad.net", "dns.controld.com",
    )
    /** Firefox turns its DoH off when this name doesn't resolve (official canary domain). */
    const val FIREFOX_CANARY = "use-application-dns.net"

    /** forcesafesearch.google.com / restrict.youtube.com and strict.bing.com (same table as src/core/hosts.js). */
    private val GOOGLE_SAFE = byteArrayOf(216.toByte(), 239.toByte(), 38, 120)
    private val BING_SAFE = byteArrayOf(204.toByte(), 79, 197.toByte(), 220.toByte())
    private val YOUTUBE_HOSTS = setOf("www.youtube.com", "m.youtube.com", "youtubei.googleapis.com", "youtube.googleapis.com", "www.youtube-nocookie.com")
    private val GOOGLE_RE = Regex("^(www\\.)?google\\.(com|[a-z]{2}|co\\.[a-z]{2}|com\\.[a-z]{2})$")

    /** The SafeSearch address for a search or YouTube host, or null if the name isn't one. */
    fun safeAddress(name: String): ByteArray? {
        val n = name.lowercase().trimEnd('.')
        return when {
            n in YOUTUBE_HOSTS -> GOOGLE_SAFE
            n == "www.bing.com" || n == "bing.com" -> BING_SAFE
            GOOGLE_RE.matches(n) -> GOOGLE_SAFE
            else -> null
        }
    }

    /** SafeSearch answer: the fixed IPv4 address for A, NODATA for anything else (so apps fall back to IPv4). */
    fun safeAnswer(q: Query, ip: ByteArray): ByteArray = answer(q, if (q.type == TYPE_A) ip else null, nxdomain = false)

    class Query(
        val id: Int, val name: String, val type: Int, val questionEnd: Int, val dns: ByteArray,
        val srcIp: ByteArray, val dstIp: ByteArray, val srcPort: Int, val dstPort: Int,
    )

    private fun u16(b: ByteArray, i: Int) = ((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF)

    /** Parses an IPv4 UDP packet carrying a DNS query; null for anything else. */
    fun parse(pkt: ByteArray, len: Int): Query? {
        if (len < 28) return null
        if ((pkt[0].toInt() ushr 4) != 4) return null
        val ihl = (pkt[0].toInt() and 0x0F) * 4
        if (ihl < 20 || len < ihl + 8 + 12) return null
        if ((pkt[9].toInt() and 0xFF) != 17) return null
        val srcPort = u16(pkt, ihl)
        val dstPort = u16(pkt, ihl + 2)
        if (dstPort != 53) return null
        val dnsStart = ihl + 8
        val dns = pkt.copyOfRange(dnsStart, len)
        if (dns.size < 12) return null
        if ((dns[2].toInt() and 0x80) != 0) return null // a response, not a query
        if (u16(dns, 4) < 1) return null
        val sb = StringBuilder()
        var i = 12
        while (true) {
            if (i >= dns.size) return null
            val l = dns[i].toInt() and 0xFF
            if (l == 0) { i += 1; break }
            if (l > 63 || i + 1 + l > dns.size) return null
            if (sb.isNotEmpty()) sb.append('.')
            for (k in 1..l) sb.append((dns[i + k].toInt() and 0xFF).toChar())
            i += 1 + l
        }
        if (i + 4 > dns.size) return null
        val type = u16(dns, i)
        return Query(u16(dns, 0), sb.toString().lowercase(), type, i + 4, dns,
            pkt.copyOfRange(12, 16), pkt.copyOfRange(16, 20), srcPort, dstPort)
    }

    /** True if the name or any parent domain is in the set. */
    fun matches(name: String, blocked: Set<String>): Boolean {
        var n = name.lowercase().trimEnd('.')
        while (n.isNotEmpty()) {
            if (n in blocked) return true
            val dot = n.indexOf('.')
            if (dot < 0) return false
            n = n.substring(dot + 1)
        }
        return false
    }

    /** Answer for a blocked name: 0.0.0.0 / :: for address queries, NODATA otherwise; NXDOMAIN if asked. */
    fun blockedAnswer(q: Query, nxdomain: Boolean = false): ByteArray = answer(
        q, when { nxdomain -> null; q.type == TYPE_A -> ByteArray(4); q.type == TYPE_AAAA -> ByteArray(16); else -> null }, nxdomain,
    )

    private fun answer(q: Query, rdata: ByteArray?, nxdomain: Boolean): ByteArray {
        val question = q.dns.copyOfRange(12, q.questionEnd)
        val addr = rdata?.size ?: 0
        val answerLen = if (addr > 0) 12 + addr else 0
        val out = ByteArray(12 + question.size + answerLen)
        out[0] = (q.id ushr 8).toByte(); out[1] = q.id.toByte()
        out[2] = (0x81 or (q.dns[2].toInt() and 0x01)).toByte() // QR + opcode 0 + RD copied
        out[3] = (if (nxdomain) 0x83 else 0x80).toByte()       // RA, rcode
        out[5] = 1.toByte()                                     // QDCOUNT
        out[7] = (if (addr > 0) 1 else 0).toByte()              // ANCOUNT
        System.arraycopy(question, 0, out, 12, question.size)
        if (addr > 0) {
            var p = 12 + question.size
            out[p++] = 0xC0.toByte(); out[p++] = 0x0C                // name → question
            out[p++] = (q.type ushr 8).toByte(); out[p++] = q.type.toByte()
            out[p++] = 0; out[p++] = 1                                // class IN
            out[p++] = 0; out[p++] = 0; out[p++] = 0; out[p++] = 30  // TTL 30 s, so unblocking is quick
            out[p++] = 0; out[p++] = addr.toByte()
            System.arraycopy(rdata!!, 0, out, p, addr)
        }
        return out
    }

    /** Wraps a DNS reply into an IPv4/UDP packet going back to the asking app. */
    fun reply(q: Query, payload: ByteArray): ByteArray {
        val total = 20 + 8 + payload.size
        val b = ByteArray(total)
        b[0] = 0x45; b[2] = (total ushr 8).toByte(); b[3] = total.toByte()
        b[6] = 0x40; b[8] = 64; b[9] = 17
        System.arraycopy(q.dstIp, 0, b, 12, 4)
        System.arraycopy(q.srcIp, 0, b, 16, 4)
        var sum = 0
        for (i in 0 until 20 step 2) sum += ((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF)
        while (sum ushr 16 != 0) sum = (sum and 0xFFFF) + (sum ushr 16)
        val ck = sum.inv() and 0xFFFF
        b[10] = (ck ushr 8).toByte(); b[11] = ck.toByte()
        b[20] = (q.dstPort ushr 8).toByte(); b[21] = q.dstPort.toByte()
        b[22] = (q.srcPort ushr 8).toByte(); b[23] = q.srcPort.toByte()
        val ul = 8 + payload.size
        b[24] = (ul ushr 8).toByte(); b[25] = ul.toByte()
        // UDP checksum 0 = not used (allowed for IPv4)
        System.arraycopy(payload, 0, b, 28, payload.size)
        return b
    }
}
