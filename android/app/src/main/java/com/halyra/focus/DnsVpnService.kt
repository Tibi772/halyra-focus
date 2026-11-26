package com.halyra.focus

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.ParcelFileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.util.concurrent.Executors

/**
 * Local website filter. Only DNS traffic to a private fake resolver is routed into
 * this VPN; blocked names get 0.0.0.0, everything else is forwarded to the real
 * resolver. Nothing leaves the phone that wouldn't have left it anyway.
 */
class DnsVpnService : VpnService() {
    private var iface: ParcelFileDescriptor? = null
    private var reader: Thread? = null
    private val pool = Executors.newFixedThreadPool(4)

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            shutdown()
            stopSelf()
            return START_NOT_STICKY
        }
        if (iface == null) establish()
        return START_STICKY
    }

    private fun upstreamDns(): InetAddress {
        try {
            val cm = getSystemService(ConnectivityManager::class.java)
            @Suppress("DEPRECATION")
            for (n in cm.allNetworks) {
                val caps = cm.getNetworkCapabilities(n) ?: continue
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue
                if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
                val lp = cm.getLinkProperties(n) ?: continue
                lp.dnsServers.firstOrNull { it is Inet4Address }?.let { return it }
            }
        } catch (_: Exception) { }
        return InetAddress.getByName("1.1.1.1")
    }

    @Volatile private var upstream: InetAddress? = null
    @Volatile private var upstreamAt = 0L

    /** The real resolver of the current (non-VPN) network, refreshed when the network changes. */
    private fun currentUpstream(): InetAddress {
        val now = System.currentTimeMillis()
        val u = upstream
        if (u != null && now - upstreamAt < 30_000) return u
        return upstreamDns().also { upstream = it; upstreamAt = now }
    }

    private fun establish() {
        val pfd = try {
            Builder()
                .setSession("Halyra Focus")
                .addAddress(TUN_ADDR, 32)
                .addDnsServer(FAKE_DNS)
                .addRoute(FAKE_DNS, 32)
                .setBlocking(true)
                .setMtu(1500)
                .apply { try { addDisallowedApplication(packageName) } catch (_: Exception) { } }
                .establish()
        } catch (e: Exception) { null }
        if (pfd == null) { running = false; stopSelf(); return }
        iface = pfd
        running = true
        val input = FileInputStream(pfd.fileDescriptor)
        val output = FileOutputStream(pfd.fileDescriptor)
        reader = Thread({
            val buf = ByteArray(32767)
            while (!Thread.currentThread().isInterrupted) {
                val n = try { input.read(buf) } catch (e: Exception) { -1 }
                if (n < 0) break
                if (n == 0) continue
                val q = Dns.parse(buf, n) ?: continue
                handle(q, output)
            }
        }, "halyra-dns").also { it.start() }
    }

    private fun write(output: FileOutputStream, pkt: ByteArray) {
        synchronized(output) { try { output.write(pkt) } catch (_: Exception) { } }
    }

    private fun handle(q: Dns.Query, output: FileOutputStream) {
        val list = blocked
        if (list.isNotEmpty()) {
            if (q.name == Dns.FIREFOX_CANARY) { write(output, Dns.reply(q, Dns.blockedAnswer(q, nxdomain = true))); return }
            if (Dns.matches(q.name, list) || Dns.matches(q.name, Dns.DOH_HOSTS)) {
                write(output, Dns.reply(q, Dns.blockedAnswer(q)))
                hits++
                return
            }
        }
        pool.execute {
            try {
                val upstream = currentUpstream()
                DatagramSocket().use { s ->
                    protect(s)
                    s.soTimeout = 4000
                    s.send(DatagramPacket(q.dns, q.dns.size, upstream, 53))
                    val rb = ByteArray(4096)
                    val rp = DatagramPacket(rb, rb.size)
                    s.receive(rp)
                    write(output, Dns.reply(q, rb.copyOf(rp.length)))
                }
            } catch (_: Exception) { /* the app's resolver retries */ }
        }
    }

    private fun shutdown() {
        running = false
        reader?.interrupt()
        try { iface?.close() } catch (_: Exception) { }
        iface = null
        reader = null
    }

    override fun onRevoke() {
        shutdown()
        super.onRevoke()
    }

    override fun onDestroy() {
        shutdown()
        pool.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val TUN_ADDR = "10.111.222.1"
        const val FAKE_DNS = "10.111.222.2"
        const val ACTION_START = "com.halyra.focus.vpn.START"
        const val ACTION_STOP = "com.halyra.focus.vpn.STOP"

        @Volatile var blocked: Set<String> = emptySet()
        @Volatile var running = false
        @Volatile var hits = 0

        fun update(ctx: Context, domains: Set<String>) {
            blocked = domains
            if (!running && prepared(ctx)) {
                try { ctx.startService(Intent(ctx, DnsVpnService::class.java).setAction(ACTION_START)) } catch (_: Exception) { }
            }
        }

        fun stop(ctx: Context) {
            blocked = emptySet()
            if (running) {
                try { ctx.startService(Intent(ctx, DnsVpnService::class.java).setAction(ACTION_STOP)) } catch (_: Exception) { }
            }
        }

        fun prepared(ctx: Context): Boolean = try { VpnService.prepare(ctx) == null } catch (_: Exception) { false }
    }
}
