package com.example.universaltimeline.ui.main

import android.app.AppOpsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.provider.Settings
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.NavKey
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.example.universaltimeline.sync.SupabaseAuth
import com.example.universaltimeline.sync.SyncQueue
import com.example.universaltimeline.theme.UniversalTimelineTheme
import com.example.universaltimeline.tracking.NotificationTracker
import com.example.universaltimeline.tracking.ScreenReceiver
import com.example.universaltimeline.tracking.TrackingWorker
import kotlinx.coroutines.launch
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

fun hasNotificationAccess(context: Context): Boolean {
  val cn = ComponentName(context, NotificationTracker::class.java)
  val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
  return flat != null && flat.contains(cn.flattenToString())
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
  val scope = rememberCoroutineScope()
  val prefs = remember { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }
  var isTracking by remember { mutableStateOf(prefs.getBoolean(KEY_TRACKING_ENABLED, false)) }
  var hasNotifAccess by remember { mutableStateOf(hasNotificationAccess(context)) }

  // Auth & sync
  val auth = remember { SupabaseAuth(context) }
  val syncQueue = remember { SyncQueue(context) }
  var isLoggedIn by remember { mutableStateOf(auth.isLoggedIn()) }
  var userEmail by remember { mutableStateOf(auth.getUserEmail()) }

  // Login form state
  var loginEmail by remember { mutableStateOf("") }
  var loginPassword by remember { mutableStateOf("") }
  var loginError by remember { mutableStateOf("") }
  var isLoggingIn by remember { mutableStateOf(false) }

  // Server URL
  var serverUrl by remember { mutableStateOf(syncQueue.getServerUrl()) }
  var serverUrlSaved by remember { mutableStateOf(syncQueue.getServerUrl().isNotEmpty()) }

  // Re-check permissions when the user returns from Settings
  val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
  DisposableEffect(lifecycleOwner) {
    val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
      if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
        hasNotifAccess = hasNotificationAccess(context)
      }
    }
    lifecycleOwner.lifecycle.addObserver(observer)
    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
  }

  // On first composition, ensure WorkManager state matches persisted toggle
  LaunchedEffect(Unit) {
    if (isTracking && hasUsageStatsPermission(context)) {
      startTracking(context)
    }
  }

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

  Column(
    modifier = modifier
      .verticalScroll(rememberScrollState())
      .padding(horizontal = 24.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    Spacer(modifier = Modifier.height(16.dp))
    Text(
      text = "Universal Timeline",
      style = MaterialTheme.typography.headlineSmall
    )
    Spacer(modifier = Modifier.height(32.dp))

    // ========== ACCOUNT SECTION ==========
    Text("Account", style = MaterialTheme.typography.titleMedium)
    Spacer(modifier = Modifier.height(8.dp))

    if (isLoggedIn) {
      Text(
        text = "✅ Signed in as $userEmail",
        style = MaterialTheme.typography.bodyMedium,
        color = Color(0xFF4CAF50)
      )
      Spacer(modifier = Modifier.height(4.dp))
      Text(
        text = "Device ID: ${syncQueue.getDeviceId()}",
        style = MaterialTheme.typography.bodySmall,
        color = Color.Gray
      )
      Spacer(modifier = Modifier.height(8.dp))
      OutlinedButton(onClick = {
        auth.signOut()
        isLoggedIn = false
        userEmail = ""
        loginEmail = ""
        loginPassword = ""
      }) {
        Text("Sign Out")
      }
    } else {
      OutlinedTextField(
        value = loginEmail,
        onValueChange = { loginEmail = it },
        label = { Text("Email") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth()
      )
      Spacer(modifier = Modifier.height(8.dp))
      OutlinedTextField(
        value = loginPassword,
        onValueChange = { loginPassword = it },
        label = { Text("Password") },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        modifier = Modifier.fillMaxWidth()
      )
      if (loginError.isNotEmpty()) {
        Spacer(modifier = Modifier.height(4.dp))
        Text(
          text = loginError,
          style = MaterialTheme.typography.bodySmall,
          color = MaterialTheme.colorScheme.error
        )
      }
      Spacer(modifier = Modifier.height(12.dp))
      Button(
        onClick = {
          if (loginEmail.isBlank() || loginPassword.isBlank()) {
            loginError = "Email and password are required"
            return@Button
          }
          isLoggingIn = true
          loginError = ""
          scope.launch {
            val result = auth.signIn(loginEmail.trim(), loginPassword)
            isLoggingIn = false
            if (result.success) {
              isLoggedIn = true
              userEmail = auth.getUserEmail()
              loginPassword = ""
              loginError = ""
            } else {
              loginError = result.error
            }
          }
        },
        enabled = !isLoggingIn,
        modifier = Modifier.fillMaxWidth()
      ) {
        if (isLoggingIn) {
          CircularProgressIndicator(
            modifier = Modifier.height(18.dp).width(18.dp),
            strokeWidth = 2.dp,
            color = MaterialTheme.colorScheme.onPrimary
          )
          Spacer(modifier = Modifier.width(8.dp))
        }
        Text(if (isLoggingIn) "Signing in..." else "Sign In")
      }
    }

    Spacer(modifier = Modifier.height(24.dp))
    HorizontalDivider()
    Spacer(modifier = Modifier.height(24.dp))

    // ========== SERVER URL SECTION ==========
    Text("Server", style = MaterialTheme.typography.titleMedium)
    Spacer(modifier = Modifier.height(8.dp))
    OutlinedTextField(
      value = serverUrl,
      onValueChange = { serverUrl = it; serverUrlSaved = false },
      label = { Text("Backend URL") },
      placeholder = { Text("http://192.168.1.x:3000") },
      singleLine = true,
      modifier = Modifier.fillMaxWidth()
    )
    Spacer(modifier = Modifier.height(8.dp))
    Button(
      onClick = {
        syncQueue.setServerUrl(serverUrl.trim())
        serverUrlSaved = true
      },
      enabled = serverUrl.isNotBlank() && !serverUrlSaved
    ) {
      Text(if (serverUrlSaved) "✅ Saved" else "Save URL")
    }

    // Show sync readiness status
    Spacer(modifier = Modifier.height(8.dp))
    val syncReady = isLoggedIn && serverUrlSaved && serverUrl.isNotBlank()
    Text(
      text = if (syncReady) "✅ Sync ready" else "⚠️ Need login + server URL to sync",
      style = MaterialTheme.typography.bodySmall,
      color = if (syncReady) Color(0xFF4CAF50) else Color(0xFFFF9800)
    )

    Spacer(modifier = Modifier.height(24.dp))
    HorizontalDivider()
    Spacer(modifier = Modifier.height(24.dp))

    // ========== TRACKING TOGGLE ==========
    Text("Tracking", style = MaterialTheme.typography.titleMedium)
    Spacer(modifier = Modifier.height(8.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
      Text("Track Activity")
      Spacer(modifier = Modifier.width(16.dp))
      Switch(
        checked = isTracking,
        onCheckedChange = { checked ->
          if (checked) {
            if (!hasUsageStatsPermission(context)) {
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
    Spacer(modifier = Modifier.height(8.dp))
    Text(
      text = if (isTracking) "Status: Tracking Active" else "Status: Inactive",
      color = if (isTracking) Color(0xFF4CAF50) else Color.Gray
    )
    if (isTracking) {
      Spacer(modifier = Modifier.height(4.dp))
      Text(
        text = "Collecting usage every ~15 minutes",
        style = MaterialTheme.typography.bodySmall,
        color = Color.Gray
      )
    }

    Spacer(modifier = Modifier.height(24.dp))
    HorizontalDivider()
    Spacer(modifier = Modifier.height(24.dp))

    // ========== NOTIFICATION ACCESS ==========
    Text("Notifications", style = MaterialTheme.typography.titleMedium)
    Spacer(modifier = Modifier.height(8.dp))
    Text(
      text = if (hasNotifAccess) "✅ Notification access granted"
             else "Required to track which apps send notifications.",
      style = MaterialTheme.typography.bodySmall,
      color = if (hasNotifAccess) Color(0xFF4CAF50) else Color.Gray
    )
    if (!hasNotifAccess) {
      Spacer(modifier = Modifier.height(8.dp))
      Button(
        onClick = {
          context.startActivity(
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
              flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
          )
        }
      ) {
        Text("Grant Notification Access")
      }
    }

    Spacer(modifier = Modifier.height(32.dp))
  }
}

@Preview(showBackground = true)
@Composable
fun MainScreenPreview() {
  UniversalTimelineTheme { MainScreenContent() }
}
