package com.example.universaltimeline.tracking

import android.content.Context
import android.content.pm.PackageManager

/**
 * Resolves package names (e.g., "com.google.android.gm") to human-readable
 * app labels (e.g., "Gmail"). Caches results to avoid repeated PackageManager lookups.
 */
class AppNameResolver(private val context: Context) {

  private val cache = HashMap<String, String>()

  fun resolve(packageName: String): String {
    cache[packageName]?.let { return it }

    val label = try {
      val appInfo = context.packageManager.getApplicationInfo(packageName, 0)
      context.packageManager.getApplicationLabel(appInfo).toString()
    } catch (e: PackageManager.NameNotFoundException) {
      // If the app is uninstalled or unknown, fall back to the package name
      packageName
    }

    cache[packageName] = label
    return label
  }
}
