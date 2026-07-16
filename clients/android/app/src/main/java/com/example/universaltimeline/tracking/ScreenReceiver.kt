package com.example.universaltimeline.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver for ACTION_SCREEN_ON and ACTION_SCREEN_OFF.
 * Must be registered dynamically (these are protected broadcasts).
 *
 * Stores screen events in EventStore for TrackingWorker to pick up.
 */
class ScreenReceiver : BroadcastReceiver() {

  companion object {
    private const val TAG = "ScreenReceiver"
    private const val PREFS_NAME = "screen_receiver_prefs"
    private const val KEY_SCREEN_OFF_TIME = "screen_off_time"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val eventStore = EventStore(context)
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()

    when (intent.action) {
      Intent.ACTION_SCREEN_OFF -> {
        // Record when the screen turned off
        prefs.edit().putLong(KEY_SCREEN_OFF_TIME, now).apply()

        val event = ActivityEvent(
          activityType = "screen",
          activityName = "Screen Off",
          startTime = now,
          endTime = now,
          packageName = "system.screen",
        )
        eventStore.addEvent(event)
        Log.d(TAG, "Screen OFF")
      }

      Intent.ACTION_SCREEN_ON -> {
        val event = ActivityEvent(
          activityType = "screen",
          activityName = "Screen On",
          startTime = now,
          endTime = now,
          packageName = "system.screen",
        )
        eventStore.addEvent(event)
        Log.d(TAG, "Screen ON")

        // If we have a screen-off timestamp, create a "screen off duration" event
        val offTime = prefs.getLong(KEY_SCREEN_OFF_TIME, 0)
        if (offTime > 0 && now > offTime) {
          val durationEvent = ActivityEvent(
            activityType = "idle",
            activityName = "Screen Off (Idle)",
            startTime = offTime,
            endTime = now,
            packageName = "system.screen",
          )
          eventStore.addEvent(durationEvent)
          prefs.edit().remove(KEY_SCREEN_OFF_TIME).apply()
          Log.d(TAG, "Idle duration: ${(now - offTime) / 1000}s")
        }
      }
    }
  }
}
