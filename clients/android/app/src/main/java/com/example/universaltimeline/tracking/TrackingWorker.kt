package com.example.universaltimeline.tracking

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Periodic background worker that collects app usage events using UsageTracker.
 * Runs every ~15 minutes via WorkManager (battery-efficient).
 *
 * Currently logs events to Logcat. Server sync will be added in Phase 8.4.
 */
class TrackingWorker(
  appContext: Context,
  params: WorkerParameters
) : CoroutineWorker(appContext, params) {

  companion object {
    const val TAG = "TrackingWorker"
    const val WORK_NAME = "universal_timeline_tracking"
  }

  private val dateFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

  override suspend fun doWork(): Result {
    Log.i(TAG, "TrackingWorker starting...")

    val tracker = UsageTracker(applicationContext)
    val events = tracker.collectEvents()

    if (events.isEmpty()) {
      Log.i(TAG, "No new events collected.")
    } else {
      Log.i(TAG, "=== Collected ${events.size} events ===")
      for (event in events) {
        val start = dateFormat.format(Date(event.startTime))
        val end = dateFormat.format(Date(event.endTime))
        val durationSec = event.durationMs / 1000
        Log.i(TAG, "  ${event.activityName} ($start - $end) [${durationSec}s]")
      }
    }

    return Result.success()
  }
}
