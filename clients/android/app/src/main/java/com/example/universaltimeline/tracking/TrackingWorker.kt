package com.example.universaltimeline.tracking

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.universaltimeline.sync.SyncQueue
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Periodic background worker that:
 * 1. Collects app usage events from UsageStatsManager
 * 2. Drains real-time events (notifications, screen on/off) from EventStore
 * 3. Syncs all events to the backend via SyncQueue
 *
 * Runs every ~15 minutes via WorkManager (battery-efficient).
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
    val syncQueue = SyncQueue(applicationContext)
    if (!syncQueue.isConfigured()) {
      Log.i(TAG, "Sync is not configured yet. Skipping tracking cycle to save battery.")
      return Result.success()
    }

    Log.i(TAG, "TrackingWorker starting...")

    // 1. Collect app usage events from UsageStatsManager
    val tracker = UsageTracker(applicationContext)
    val usageEvents = tracker.collectEvents()

    // 2. Drain real-time events from EventStore (notifications, screen on/off)
    val eventStore = EventStore(applicationContext)
    val realtimeEvents = eventStore.drainEvents()

    val allEvents = usageEvents + realtimeEvents

    if (allEvents.isEmpty()) {
      Log.i(TAG, "No new events collected.")
      return Result.success()
    }

    Log.i(TAG, "=== Collected ${allEvents.size} events (${usageEvents.size} usage, ${realtimeEvents.size} realtime) ===")
    for (event in allEvents.sortedBy { it.startTime }) {
      val start = dateFormat.format(Date(event.startTime))
      val end = dateFormat.format(Date(event.endTime))
      val durationSec = event.durationMs / 1000
      Log.i(TAG, "  [${event.activityType}] ${event.activityName} ($start - $end) [${durationSec}s]")
    }

    // 3. Sync to backend
    val synced = syncQueue.flush(allEvents)
    Log.i(TAG, "Synced $synced/${allEvents.size} events to server")

    return Result.success()
  }
}
