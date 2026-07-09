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
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.NavKey
import com.example.universaltimeline.theme.UniversalTimelineTheme

fun hasUsageStatsPermission(context: Context): Boolean {
  val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
  val mode = appOps.unsafeCheckOpNoThrow(
    AppOpsManager.OPSTR_GET_USAGE_STATS,
    android.os.Process.myUid(),
    context.packageName
  )
  return mode == AppOpsManager.MODE_ALLOWED
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
  var isTracking by remember { mutableStateOf(false) }
  val context = LocalContext.current

  Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
    Text(text = "Universal Timeline", style = androidx.compose.material3.MaterialTheme.typography.headlineSmall)
    Spacer(modifier = Modifier.height(32.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
      Text("Track Activity")
      Spacer(modifier = Modifier.width(16.dp))
      Switch(
        checked = isTracking,
        onCheckedChange = { checked ->
          if (checked) {
            if (!hasUsageStatsPermission(context)) {
              // Request permission at runtime by launching settings intent
              context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
              })
            } else {
              isTracking = true
            }
          } else {
            isTracking = false
          }
        }
      )
    }
    Spacer(modifier = Modifier.height(16.dp))
    Text(
      text = if (isTracking) "Status: Tracking Active" else "Status: Inactive",
      color = if (isTracking) androidx.compose.ui.graphics.Color(0xFF4CAF50) else androidx.compose.ui.graphics.Color.Gray
    )
  }
}

@Preview(showBackground = true)
@Composable
fun MainScreenPreview() {
  UniversalTimelineTheme { MainScreenContent() }
}
