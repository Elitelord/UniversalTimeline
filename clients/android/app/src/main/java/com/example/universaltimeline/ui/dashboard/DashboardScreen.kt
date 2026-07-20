package com.example.universaltimeline.ui.dashboard

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.universaltimeline.tracking.AppNameResolver
import com.example.universaltimeline.tracking.ScreenReceiver
import com.example.universaltimeline.tracking.TrackingUtils
import com.example.universaltimeline.sync.SyncQueue
import com.example.universaltimeline.tracking.EventStore
import com.example.universaltimeline.tracking.UsageTracker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun DashboardScreen(modifier: Modifier = Modifier) {
  val context = LocalContext.current
  val prefs = remember { context.getSharedPreferences(TrackingUtils.PREFS_NAME, Context.MODE_PRIVATE) }
  var isTracking by remember { mutableStateOf(prefs.getBoolean(TrackingUtils.KEY_TRACKING_ENABLED, false)) }
  var recentEvents by remember { mutableStateOf(listOf<SystemEventLog>()) }

  // Register/unregister ScreenReceiver when tracking is toggled
  DisposableEffect(isTracking) {
    val receiver = ScreenReceiver()
    if (isTracking) {
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_SCREEN_OFF)
      }
      context.registerReceiver(receiver, filter)
    }
    onDispose {
      try {
        context.unregisterReceiver(receiver)
      } catch (_: IllegalArgumentException) { }
    }
  }

  // Load recent events when screen is composed or tracking is active
  LaunchedEffect(isTracking) {
    recentEvents = fetchRecentSystemEvents(context)
  }

  Column(
    modifier = modifier
      .fillMaxSize()
      .padding(16.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    Text(
      text = "Dashboard",
      style = MaterialTheme.typography.headlineMedium,
      fontWeight = FontWeight.Bold,
      color = MaterialTheme.colorScheme.primary
    )
    Spacer(modifier = Modifier.height(24.dp))

    // Status Card
    Card(
      shape = RoundedCornerShape(16.dp),
      colors = CardDefaults.cardColors(
        containerColor = MaterialTheme.colorScheme.surfaceVariant
      ),
      modifier = Modifier
        .fillMaxWidth()
        .padding(vertical = 8.dp)
    ) {
      Column(
        modifier = Modifier.padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
      ) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.Center,
          modifier = Modifier.fillMaxWidth()
        ) {
          Box(
            modifier = Modifier
              .size(12.dp)
              .background(
                color = if (isTracking) Color(0xFF4CAF50) else MaterialTheme.colorScheme.outline,
                shape = RoundedCornerShape(50)
              )
          )
          Spacer(modifier = Modifier.width(8.dp))
          Text(
            text = if (isTracking) "Tracking Active" else "Tracking Inactive",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
          )
        }
        Spacer(modifier = Modifier.height(16.dp))
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.SpaceBetween,
          modifier = Modifier.fillMaxWidth()
        ) {
          Text("Enable Background Tracking", style = MaterialTheme.typography.bodyMedium)
          Switch(
            checked = isTracking,
            onCheckedChange = { checked ->
              if (checked) {
                if (!TrackingUtils.hasUsageStatsPermission(context)) {
                  context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                  })
                } else {
                  isTracking = true
                  prefs.edit().putBoolean(TrackingUtils.KEY_TRACKING_ENABLED, true).apply()
                  TrackingUtils.startTracking(context)
                }
              } else {
                isTracking = false
                prefs.edit().putBoolean(TrackingUtils.KEY_TRACKING_ENABLED, false).apply()
                TrackingUtils.stopTracking(context)
              }
            }
          )
        }

        // Manual sync button
        val syncQueue = remember { SyncQueue(context) }
        var isSyncing by remember { mutableStateOf(false) }
        var syncResult by remember { mutableStateOf("") }
        val coroutineScope = rememberCoroutineScope()

        if (isTracking && syncQueue.isConfigured()) {
          Spacer(modifier = Modifier.height(16.dp))
          Button(
            onClick = {
              isSyncing = true
              syncResult = ""
              coroutineScope.launch {
                try {
                  val allEvents = withContext(Dispatchers.IO) {
                    val tracker = UsageTracker(context)
                    val usageEvents = tracker.collectEvents()
                    val eventStore = EventStore(context)
                    val realtimeEvents = eventStore.drainEvents()
                    usageEvents + realtimeEvents
                  }
                  
                  if (allEvents.isEmpty()) {
                    syncResult = "No new events to sync"
                  } else {
                    val synced = syncQueue.flush(allEvents)
                    syncResult = "Synced $synced events"
                  }
                } catch (e: Exception) {
                  syncResult = "Sync failed: ${e.message}"
                } finally {
                  isSyncing = false
                }
              }
            },
            enabled = !isSyncing,
            modifier = Modifier.fillMaxWidth()
          ) {
            if (isSyncing) {
              CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary
              )
              Spacer(modifier = Modifier.width(8.dp))
              Text("Syncing...")
            } else {
              Text("Sync Now")
            }
          }
          if (syncResult.isNotEmpty()) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
              text = syncResult,
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.onSurfaceVariant
            )
          }
        }
      }
    }

    Spacer(modifier = Modifier.height(24.dp))

    // Recent events list header
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Text(
        text = "Recent Activity Log",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold
      )
      TextButton(onClick = { recentEvents = fetchRecentSystemEvents(context) }) {
        Text("Refresh")
      }
    }

    Spacer(modifier = Modifier.height(8.dp))

    if (recentEvents.isEmpty()) {
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .weight(1f),
        contentAlignment = Alignment.Center
      ) {
        Text(
          text = "No recent events. Try opening other apps!",
          style = MaterialTheme.typography.bodyMedium,
          color = Color.Gray
        )
      }
    } else {
      LazyColumn(
        modifier = Modifier
          .fillMaxWidth()
          .weight(1f),
        verticalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        items(recentEvents) { item ->
          EventLogItem(item)
        }
      }
    }
  }
}

data class SystemEventLog(
  val appName: String,
  val type: String,
  val time: String
)

private fun fetchRecentSystemEvents(context: Context): List<SystemEventLog> {
  val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
    ?: return emptyList()

  val appNameResolver = AppNameResolver(context)
  val now = System.currentTimeMillis()
  val queryStart = now - 2 * 60 * 60 * 1000 // Last 2 hours
  val events = usageStatsManager.queryEvents(queryStart, now)
  val list = mutableListOf<SystemEventLog>()

  val event = UsageEvents.Event()
  val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

  while (events.hasNextEvent()) {
    events.getNextEvent(event)
    val typeStr = when (event.eventType) {
      UsageEvents.Event.ACTIVITY_RESUMED -> "Resumed"
      UsageEvents.Event.ACTIVITY_PAUSED -> "Paused"
      else -> null
    }

    if (typeStr != null) {
      // Don't log system UI or launcher to keep dashboard clean
      if (event.packageName != "android" && event.packageName != "com.android.systemui" && !event.packageName.contains("launcher")) {
        val appName = appNameResolver.resolve(event.packageName)
        list.add(
          SystemEventLog(
            appName = appName,
            type = typeStr,
            time = timeFormat.format(Date(event.timeStamp))
          )
        )
      }
    }
  }

  // Reverse so newest is first, take top 15
  return list.reversed().take(15)
}

@Composable
fun EventLogItem(log: SystemEventLog) {
  Card(
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(8.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(12.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Column {
        Text(log.appName, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyLarge)
        Text(
          text = log.type,
          color = if (log.type == "Resumed") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
          style = MaterialTheme.typography.bodyMedium
        )
      }
      Text(log.time, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f))
    }
  }
}
