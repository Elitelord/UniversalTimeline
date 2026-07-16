package com.example.universaltimeline.tracking

/**
 * Data class representing an activity event, matching the backend event model.
 */
data class ActivityEvent(
  val activityType: String,
  val activityName: String,
  val startTime: Long,    // epoch millis
  val endTime: Long,      // epoch millis
  val packageName: String,
  val metadata: Map<String, String> = emptyMap()
) {
  val durationMs: Long get() = endTime - startTime

  companion object
}
