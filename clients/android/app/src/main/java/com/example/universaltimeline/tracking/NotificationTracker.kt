package com.example.universaltimeline.tracking

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * Captures notification metadata (app name, timestamp) when notifications arrive.
 * Does NOT capture notification content for privacy.
 *
 * Requires the user to manually grant Notification Access in Settings.
 * Android manages the lifecycle of this service automatically.
 */
class NotificationTracker : NotificationListenerService() {

  companion object {
    private const val TAG = "NotificationTracker"
  }

  private val appNameResolver by lazy { AppNameResolver(applicationContext) }
  private val eventStore by lazy { EventStore(applicationContext) }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    sbn ?: return

    val packageName = sbn.packageName ?: return
    // Skip system UI notifications and our own app
    if (packageName == "android" ||
        packageName == "com.android.systemui" ||
        packageName == applicationContext.packageName) {
      return
    }

    val appName = appNameResolver.resolve(packageName)
    val timestamp = sbn.postTime

    val event = ActivityEvent(
      activityType = "notification",
      activityName = appName,
      startTime = timestamp,
      endTime = timestamp,  // notifications are point-in-time events
      packageName = packageName,
      metadata = mapOf("category" to (sbn.notification?.category ?: "unknown"))
    )

    eventStore.addEvent(event)
    Log.d(TAG, "Notification from $appName ($packageName)")
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification?) {
    // We only track when notifications arrive, not when dismissed
  }
}
