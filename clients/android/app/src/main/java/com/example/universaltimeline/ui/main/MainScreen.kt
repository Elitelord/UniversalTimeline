package com.example.universaltimeline.ui.main

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.NavKey
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.example.universaltimeline.theme.UniversalTimelineTheme
import com.example.universaltimeline.tracking.TrackingWorker
import java.util.concurrent.TimeUnit

private const val PREFS_NAME = "tracking_prefs"
private const val KEY_TRACKING_ENABLED = "tracking_enabled"

fun hasUsageStatsPermission(context: Context): Boolean {
  val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
  val mode = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
    appOps.unsafeCheckOpNoThrow(
      AppOpsManager.OPSTR_GET_USAGE_STATS,
      android.os.Process.myUid(),
      context.packageName
    )
  } else {
    @Suppress("DEPRECATION")
    appOps.checkOpNoThrow(
      AppOpsManager.OPSTR_GET_USAGE_STATS,
      android.os.Process.myUid(),
      context.packageName
    )
  }
  return mode == AppOpsManager.MODE_ALLOWED
}

private fun startTracking(context: Context) {
  val workRequest = PeriodicWorkRequestBuilder<TrackingWorker>(
    15, TimeUnit.MINUTES
  ).build()

  WorkManager.getInstance(context).enqueueUniquePeriodicWork(
    TrackingWorker.WORK_NAME,
    ExistingPeriodicWorkPolicy.KEEP,
    workRequest
  )
}

private fun stopTracking(context: Context) {
  WorkManager.getInstance(context).cancelUniqueWork(TrackingWorker.WORK_NAME)
}

@Composable
fun MainScreen(
  onItemClick: (NavKey) -> Unit,
  modifier: Modifier = Modifier,
) {
  MainScreenContent(modifier = modifier)
}

@Composable
internal fun MainScreenContent(modifier: Modifier = Modifier) {
  val context = LocalContext.current
  val prefs = remember { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }
  var isTracking by remember { mutableStateOf(prefs.getBoolean(KEY_TRACKING_ENABLED, false)) }

  // On first composition, ensure WorkManager state matches persisted toggle
  LaunchedEffect(Unit) {
    if (isTracking && hasUsageStatsPermission(context)) {
      startTracking(context)
    }
  }

  Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
    Text(
      text = "Universal Timeline",
      style = MaterialTheme.typography.headlineSmall
    )
    Spacer(modifier = Modifier.height(32.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
      Text("Track Activity")
      Spacer(modifier = Modifier.width(16.dp))
      Switch(
        checked = isTracking,
        onCheckedChange = { checked ->
          if (checked) {
            if (!hasUsageStatsPermission(context)) {
              // Send user to settings to grant usage access
              context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
              })
            } else {
              isTracking = true
              prefs.edit().putBoolean(KEY_TRACKING_ENABLED, true).apply()
              startTracking(context)
            }
          } else {
            isTracking = false
            prefs.edit().putBoolean(KEY_TRACKING_ENABLED, false).apply()
            stopTracking(context)
          }
        }
      )
    }
    Spacer(modifier = Modifier.height(16.dp))
    Text(
      text = if (isTracking) "Status: Tracking Active" else "Status: Inactive",
      color = if (isTracking) Color(0xFF4CAF50) else Color.Gray
    )
    if (isTracking) {
      Spacer(modifier = Modifier.height(8.dp))
      Text(
        text = "Collecting usage every ~15 minutes",
        style = MaterialTheme.typography.bodySmall,
        color = Color.Gray
      )
    }
  }
}

@Preview(showBackground = true)
@Composable
fun MainScreenPreview() {
  UniversalTimelineTheme { MainScreenContent() }
}
