package com.example.universaltimeline.tracking

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.util.Log

/**
 * Queries UsageStatsManager for app usage events and converts them into
 * ActivityEvent objects with human-readable app names.
 *
 * Uses ACTIVITY_RESUMED / ACTIVITY_PAUSED event pairs to compute precise
 * foreground time windows per app.
 */
class UsageTracker(private val context: Context) {

  companion object {
    private const val TAG = "UsageTracker"
    private const val PREFS_NAME = "usage_tracker_prefs"
    private const val KEY_LAST_QUERY_TIME = "last_query_time"
  }

  private val appNameResolver = AppNameResolver(context)
  private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  /** System packages that should not be tracked as user activity */
  private val excludedPackages = setOf(
    "com.android.systemui",
    "com.android.launcher",
    "com.android.launcher3",
    "com.google.android.apps.nexuslauncher",
    "com.sec.android.app.launcher",       // Samsung launcher
    "com.android.settings",
    "com.android.inputmethod.latin",
    "com.google.android.inputmethod.latin",
    "com.samsung.android.honeyboard",     // Samsung keyboard
    "com.android.providers.media",
    "com.android.providers.downloads",
    "com.android.permissioncontroller",
    "com.android.packageinstaller",
    "com.google.android.permissioncontroller",
    "com.google.android.packageinstaller",
    "com.android.shell",
    "android",
    context.packageName                    // Our own app
  )

  /**
   * Collects app usage events since the last successful query.
   * On first run, looks back 15 minutes.
   */
  fun collectEvents(): List<ActivityEvent> {
    val usageStatsManager =
      context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager

    if (usageStatsManager == null) {
      Log.e(TAG, "UsageStatsManager not available")
      return emptyList()
    }

    val now = System.currentTimeMillis()
    val lastQueryTime = prefs.getLong(KEY_LAST_QUERY_TIME, now - 15 * 60 * 1000)

    val events = mutableListOf<ActivityEvent>()
    // Track the most recent ACTIVITY_RESUMED per package to pair with PAUSED
    val resumedAt = HashMap<String, Long>()

    val usageEvents = usageStatsManager.queryEvents(lastQueryTime, now)
    val event = UsageEvents.Event()

    while (usageEvents.hasNextEvent()) {
      usageEvents.getNextEvent(event)

      when (event.eventType) {
        UsageEvents.Event.ACTIVITY_RESUMED -> {
          if (event.packageName !in excludedPackages) {
            resumedAt[event.packageName] = event.timeStamp
          }
        }
        UsageEvents.Event.ACTIVITY_PAUSED -> {
          val startTime = resumedAt.remove(event.packageName)
          if (startTime != null && event.timeStamp > startTime) {
            val appName = appNameResolver.resolve(event.packageName)
            events.add(
              ActivityEvent(
                activityType = classifyActivity(appName, event.packageName),
                activityName = appName,
                startTime = startTime,
                endTime = event.timeStamp,
                packageName = event.packageName
              )
            )
          }
        }
      }
    }

    // For apps that are still in the foreground (resumed but not yet paused),
    // create an event ending at "now" — they'll get a proper end time next cycle.
    for ((packageName, startTime) in resumedAt) {
      if (now > startTime && packageName !in excludedPackages) {
        val appName = appNameResolver.resolve(packageName)
        events.add(
          ActivityEvent(
            activityType = classifyActivity(appName, packageName),
            activityName = appName,
            startTime = startTime,
            endTime = now,
            packageName = packageName
          )
        )
      }
    }

    // Save the query timestamp so the next run picks up where we left off
    prefs.edit().putLong(KEY_LAST_QUERY_TIME, now).apply()

    Log.i(TAG, "Collected ${events.size} events since ${java.util.Date(lastQueryTime)}")
    return events
  }

  private fun classifyActivity(appName: String, packageName: String): String {
    val lowerName = appName.lowercase()
    val lowerPkg = packageName.lowercase()

    if (lowerName in setOf("chrome", "firefox", "edge", "brave") || lowerPkg.contains("browser")) {
      return "browsing"
    }

    if (lowerName in setOf("instagram", "whatsapp", "discord", "slack", "teams", "telegram", "signal", "snapchat", "messenger", "messages", "gmail", "outlook") || lowerPkg.contains("messaging")) {
      return "communication"
    }

    if (lowerName in setOf("notion", "docs", "sheets", "drive", "calendar", "notes", "keep", "obsidian", "evernote")) {
      return "productivity"
    }

    if (lowerName in setOf("youtube", "tiktok", "netflix", "spotify", "hulu", "twitch")) {
      return "media"
    }

    return "application"
  }
}
