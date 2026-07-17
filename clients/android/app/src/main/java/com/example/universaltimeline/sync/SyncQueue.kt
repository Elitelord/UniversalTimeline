package com.example.universaltimeline.sync

import android.content.Context
import android.util.Log
import com.example.universaltimeline.tracking.ActivityEvent
import com.example.universaltimeline.tracking.EventStore
import com.example.universaltimeline.tracking.toJson
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * Sync queue that batches ActivityEvents and flushes them to the backend API.
 * Implements exponential backoff on failure (1s, 2s, 4s, 8s... max 60s).
 *
 * Events that fail to sync are returned to the EventStore for retry on the next
 * WorkManager cycle.
 */
class SyncQueue(private val context: Context) {

  companion object {
    private const val TAG = "SyncQueue"
    private const val PREFS_NAME = "sync_queue_prefs"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_AUTH_TOKEN = "auth_token"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_BACKOFF_MS = "backoff_ms"
    private const val MAX_BATCH_SIZE = 50
    private const val INITIAL_BACKOFF_MS = 1000L
    private const val MAX_BACKOFF_MS = 60_000L
  }

  private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("UTC")
  }

  /**
   * Returns true if sync is configured (server URL and auth token set).
   */
  fun isConfigured(): Boolean {
    return getServerUrl().isNotEmpty() && getAuthToken().isNotEmpty()
  }

  fun getServerUrl(): String = prefs.getString(KEY_SERVER_URL, "") ?: ""
  fun getAuthToken(): String = prefs.getString(KEY_AUTH_TOKEN, "") ?: ""

  fun getDeviceId(): String {
    var id = prefs.getString(KEY_DEVICE_ID, null)
    if (id == null) {
      id = "android-${UUID.randomUUID().toString().take(8)}"
      prefs.edit().putString(KEY_DEVICE_ID, id).apply()
    }
    return id
  }

  fun configure(serverUrl: String, authToken: String) {
    prefs.edit()
      .putString(KEY_SERVER_URL, serverUrl.trimEnd('/'))
      .putString(KEY_AUTH_TOKEN, authToken)
      .apply()
    Log.i(TAG, "Sync configured: $serverUrl")
  }

  /**
   * Attempt to flush events to the backend. Returns the number of events
   * successfully synced. Failed events are re-added to the EventStore.
   */
  fun flush(events: List<ActivityEvent>): Int {
    if (events.isEmpty()) return 0
    if (!isConfigured()) {
      Log.w(TAG, "Sync not configured, skipping flush")
      return 0
    }

    val deviceId = getDeviceId()
    var totalSynced = 0

    // Process in batches of MAX_BATCH_SIZE
    val batches = events.chunked(MAX_BATCH_SIZE)
    val failedEvents = mutableListOf<ActivityEvent>()

    for (batch in batches) {
      val success = sendBatch(batch, deviceId)
      if (success) {
        totalSynced += batch.size
        resetBackoff()
        Log.i(TAG, "Synced batch of ${batch.size} events")
      } else {
        failedEvents.addAll(batch)
        increaseBackoff()
        Log.w(TAG, "Failed to sync batch of ${batch.size} events, will retry")
        // Stop trying further batches on failure
        break
      }
    }

    // Re-add failed events to the store for next cycle
    if (failedEvents.isNotEmpty()) {
      val eventStore = EventStore(context)
      for (event in failedEvents) {
        eventStore.addEvent(event)
      }
      Log.w(TAG, "Re-queued ${failedEvents.size} failed events")
    }

    return totalSynced
  }

  private fun sendBatch(events: List<ActivityEvent>, deviceId: String): Boolean {
    return try {
      val jsonArray = JSONArray()
      for (event in events) {
        val obj = JSONObject().apply {
          put("id", UUID.randomUUID().toString())
          put("device_id", deviceId)
          put("activity_type", event.activityType)
          put("activity_name", event.activityName)
          put("start_time", isoFormat.format(Date(event.startTime)))
          put("end_time", isoFormat.format(Date(event.endTime)))
          if (event.metadata.isNotEmpty()) {
            val meta = JSONObject()
            for ((k, v) in event.metadata) meta.put(k, v)
            meta.put("package_name", event.packageName)
            put("metadata", meta)
          } else {
            put("metadata", JSONObject().apply { put("package_name", event.packageName) })
          }
        }
        jsonArray.put(obj)
      }

      val url = URL("${getServerUrl()}/events/list")
      val conn = url.openConnection() as HttpURLConnection
      conn.requestMethod = "POST"
      conn.setRequestProperty("Content-Type", "application/json")
      conn.setRequestProperty("Authorization", "Bearer ${getAuthToken()}")
      conn.doOutput = true
      conn.connectTimeout = 10_000
      conn.readTimeout = 10_000

      OutputStreamWriter(conn.outputStream).use { writer ->
        writer.write(jsonArray.toString())
        writer.flush()
      }

      val responseCode = conn.responseCode
      conn.disconnect()

      if (responseCode in 200..299) {
        true
      } else {
        Log.w(TAG, "Server returned $responseCode")
        false
      }
    } catch (e: Exception) {
      Log.e(TAG, "Network error during sync", e)
      false
    }
  }

  private fun resetBackoff() {
    prefs.edit().putLong(KEY_BACKOFF_MS, INITIAL_BACKOFF_MS).apply()
  }

  private fun increaseBackoff() {
    val current = prefs.getLong(KEY_BACKOFF_MS, INITIAL_BACKOFF_MS)
    val next = (current * 2).coerceAtMost(MAX_BACKOFF_MS)
    prefs.edit().putLong(KEY_BACKOFF_MS, next).apply()
    Log.d(TAG, "Backoff increased to ${next}ms")
  }
}
