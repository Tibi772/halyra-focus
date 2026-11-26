package com.halyra.focus

import android.app.NotificationManager
import android.content.Context
import android.net.ConnectivityManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import org.json.JSONObject

object Perms {
    fun overlay(ctx: Context) = Settings.canDrawOverlays(ctx)
    fun notifications(ctx: Context) = ctx.getSystemService(NotificationManager::class.java).areNotificationsEnabled()
    fun battery(ctx: Context) = ctx.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(ctx.packageName)

    /** A hostname set in Android's "Private DNS" bypasses the website filter. */
    fun privateDnsHost(ctx: Context): String? = try {
        if (Build.VERSION.SDK_INT < 28) null else {
            val cm = ctx.getSystemService(ConnectivityManager::class.java)
            @Suppress("DEPRECATION")
            cm.allNetworks.mapNotNull { cm.getLinkProperties(it) }.firstOrNull { it.isPrivateDnsActive && !it.privateDnsServerName.isNullOrEmpty() }?.privateDnsServerName
        }
    } catch (_: Exception) { null }

    fun json(ctx: Context): String = JSONObject()
        .put("usage", Usage.hasAccess(ctx))
        .put("overlay", overlay(ctx))
        .put("vpn", DnsVpnService.prepared(ctx))
        .put("notifications", notifications(ctx))
        .put("battery", battery(ctx))
        .put("privateDns", privateDnsHost(ctx) ?: JSONObject.NULL)
        .put("sdk", Build.VERSION.SDK_INT)
        .toString()
}
