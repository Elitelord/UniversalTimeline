package com.example.universaltimeline.ui.stats

import android.app.usage.UsageStatsManager
import android.content.Context
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
import com.example.universaltimeline.tracking.TrackingUtils
import java.util.Calendar

@Composable
fun LocalStatsScreen(modifier: Modifier = Modifier) {
  val context = LocalContext.current
  var totalScreenTime by remember { mutableStateOf(0L) }
  var appUsageList by remember { mutableStateOf(listOf<AppUsageItem>()) }
  var isPermissionGranted by remember { mutableStateOf(TrackingUtils.hasUsageStatsPermission(context)) }

  LaunchedEffect(Unit) {
    isPermissionGranted = TrackingUtils.hasUsageStatsPermission(context)
    if (isPermissionGranted) {
      val stats = fetchTodayUsageStats(context)
      totalScreenTime = stats.sumOf { it.durationMs }
      appUsageList = stats
    }
  }

  Column(
    modifier = modifier
      .fillMaxSize()
      .padding(16.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    Text(
      text = "Local Statistics",
      style = MaterialTheme.typography.headlineMedium,
      fontWeight = FontWeight.Bold,
      color = MaterialTheme.colorScheme.primary
    )
    Spacer(modifier = Modifier.height(24.dp))

    if (!isPermissionGranted) {
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .weight(1f),
        contentAlignment = Alignment.Center
      ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
          Text(
            text = "Usage stats permission required.",
            style = MaterialTheme.typography.bodyLarge,
            color = Color.Gray
          )
          Spacer(modifier = Modifier.height(16.dp))
          Text(
            text = "Please enable tracking on the Dashboard or grant permissions in Settings.",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.Gray
          )
        }
      }
    } else {
      // Total screen time summary widget
      Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
          containerColor = MaterialTheme.colorScheme.primaryContainer
        ),
        modifier = Modifier
          .fillMaxWidth()
          .padding(vertical = 8.dp)
      ) {
        Column(
          modifier = Modifier.padding(20.dp),
          horizontalAlignment = Alignment.CenterHorizontally
        ) {
          Text(
            text = "Total Screen Time Today",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
          )
          Spacer(modifier = Modifier.height(8.dp))
          Text(
            text = formatDuration(totalScreenTime),
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onPrimaryContainer
          )
        }
      }

      Spacer(modifier = Modifier.height(24.dp))

      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text(
          text = "App Usage Breakdown",
          style = MaterialTheme.typography.titleMedium,
          fontWeight = FontWeight.SemiBold
        )
        TextButton(onClick = {
          val stats = fetchTodayUsageStats(context)
          totalScreenTime = stats.sumOf { it.durationMs }
          appUsageList = stats
        }) {
          Text("Refresh")
        }
      }

      Spacer(modifier = Modifier.height(8.dp))

      if (appUsageList.isEmpty()) {
        Box(
          modifier = Modifier
            .fillMaxWidth()
            .weight(1f),
          contentAlignment = Alignment.Center
        ) {
          Text(
            text = "No app usage recorded today.",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.Gray
          )
        }
      } else {
        LazyColumn(
          modifier = Modifier
            .fillMaxWidth()
            .weight(1f),
          verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
          items(appUsageList) { item ->
            AppUsageRow(item, totalScreenTime)
          }
        }
      }
    }
  }
}

data class AppUsageItem(
  val appName: String,
  val packageName: String,
  val durationMs: Long
)

private fun fetchTodayUsageStats(context: Context): List<AppUsageItem> {
  val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
    ?: return emptyList()

  val appNameResolver = AppNameResolver(context)

  // Start of today (midnight)
  val calendar = Calendar.getInstance().apply {
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
  }
  val startTime = calendar.timeInMillis
  val endTime = System.currentTimeMillis()

  val stats = usageStatsManager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startTime, endTime)
    ?: return emptyList()

  return stats
    .filter { it.totalTimeInForeground > 0 }
    .map {
      AppUsageItem(
        appName = appNameResolver.resolve(it.packageName),
        packageName = it.packageName,
        durationMs = it.totalTimeInForeground
      )
    }
    // Filter out typical system packages to keep it clean
    .filter { !it.packageName.contains("com.android.providers") && it.packageName != "android" }
    .groupBy { it.appName }
    .map { (name, group) ->
      AppUsageItem(
        appName = name,
        packageName = group.first().packageName,
        durationMs = group.sumOf { it.durationMs }
      )
    }
    .sortedByDescending { it.durationMs }
}

private fun formatDuration(millis: Long): String {
  val totalSeconds = millis / 1000
  val hours = totalSeconds / 3600
  val minutes = (totalSeconds % 3600) / 60
  val seconds = totalSeconds % 60

  return when {
    hours > 0 -> "${hours}h ${minutes}m"
    minutes > 0 -> "${minutes}m ${seconds}s"
    else -> "${seconds}s"
  }
}

@Composable
fun AppUsageRow(item: AppUsageItem, totalTime: Long) {
  val percentage = if (totalTime > 0) item.durationMs.toFloat() / totalTime else 0f

  Column(modifier = Modifier.fillMaxWidth()) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Text(
        text = item.appName,
        fontWeight = FontWeight.Medium,
        style = MaterialTheme.typography.bodyLarge
      )
      Text(
        text = formatDuration(item.durationMs),
        fontWeight = FontWeight.Bold,
        style = MaterialTheme.typography.bodyMedium
      )
    }
    Spacer(modifier = Modifier.height(4.dp))
    LinearProgressIndicator(
      progress = { percentage },
      modifier = Modifier
        .fillMaxWidth()
        .height(8.dp)
        .background(Color.Transparent),
      strokeCap = androidx.compose.ui.graphics.StrokeCap.Round,
      color = MaterialTheme.colorScheme.secondary
    )
  }
}
