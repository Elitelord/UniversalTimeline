package com.example.universaltimeline.tracking

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Simple SharedPreferences-backed event store for real-time listeners
 * (notifications, screen on/off) that fire between WorkManager runs.
 *
 * Events are stored as a JSON array and drained by TrackingWorker.
 */
class EventStore(context: Context) {

  companion object {
    private const val TAG = "EventStore"
    private const val PREFS_NAME = "event_store"
    private const val KEY_EVENTS = "pending_events"
  }

  private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  /**
   * Append an event to the local store (thread-safe via synchronized).
   */
  @Synchronized
  fun addEvent(event: ActivityEvent) {
    val arr = loadArray()
    arr.put(event.toJson())
    prefs.edit().putString(KEY_EVENTS, arr.toString()).apply()
    Log.d(TAG, "Stored event: ${event.activityType} / ${event.activityName}")
  }

  /**
   * Drain all pending events and clear the store. Returns the events.
   */
  @Synchronized
  fun drainEvents(): List<ActivityEvent> {
    val arr = loadArray()
    if (arr.length() == 0) return emptyList()

    val events = mutableListOf<ActivityEvent>()
    for (i in 0 until arr.length()) {
      try {
        events.add(ActivityEvent.fromJson(arr.getJSONObject(i)))
      } catch (e: Exception) {
        Log.w(TAG, "Skipping malformed event at index $i", e)
      }
    }

    prefs.edit().remove(KEY_EVENTS).apply()
    Log.d(TAG, "Drained ${events.size} events from store")
    return events
  }

  private fun loadArray(): JSONArray {
    val raw = prefs.getString(KEY_EVENTS, null) ?: return JSONArray()
    return try {
      JSONArray(raw)
    } catch (e: Exception) {
      JSONArray()
    }
  }
}

// Extension functions for JSON serialization
fun ActivityEvent.toJson(): JSONObject {
  return JSONObject().apply {
    put("activityType", activityType)
    put("activityName", activityName)
    put("startTime", startTime)
    put("endTime", endTime)
    put("packageName", packageName)
    for ((k, v) in metadata) {
      // Store metadata under a nested object
      if (!has("metadata")) put("metadata", JSONObject())
      getJSONObject("metadata").put(k, v)
    }
  }
}

fun ActivityEvent.Companion.fromJson(json: JSONObject): ActivityEvent {
  val meta = mutableMapOf<String, String>()
  if (json.has("metadata")) {
    val metaObj = json.getJSONObject("metadata")
    for (key in metaObj.keys()) {
      meta[key] = metaObj.getString(key)
    }
  }
  return ActivityEvent(
    activityType = json.getString("activityType"),
    activityName = json.getString("activityName"),
    startTime = json.getLong("startTime"),
    endTime = json.getLong("endTime"),
    packageName = json.optString("packageName", ""),
    metadata = meta
  )
}
