package com.example.universaltimeline.ui.settings

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.example.universaltimeline.sync.SupabaseAuth
import com.example.universaltimeline.sync.SyncQueue
import com.example.universaltimeline.sync.AutoUpdater
import com.example.universaltimeline.tracking.TrackingUtils
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(modifier: Modifier = Modifier) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  // Permissions state
  var hasUsagePermission by remember { mutableStateOf(TrackingUtils.hasUsageStatsPermission(context)) }
  var hasNotifAccess by remember { mutableStateOf(TrackingUtils.hasNotificationAccess(context)) }

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

  // Auto-updater
  val updater = remember { AutoUpdater(context) }
  var isCheckingUpdate by remember { mutableStateOf(false) }
  var updateInfo by remember { mutableStateOf<AutoUpdater.UpdateInfo?>(null) }
  var updateStatus by remember { mutableStateOf("") }

  // Re-check permissions when screen gains focus
  val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
  DisposableEffect(lifecycleOwner) {
    val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
      if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
        hasUsagePermission = TrackingUtils.hasUsageStatsPermission(context)
        hasNotifAccess = TrackingUtils.hasNotificationAccess(context)
      }
    }
    lifecycleOwner.lifecycle.addObserver(observer)
    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
  }

  Column(
    modifier = modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    Text(
      text = "Settings",
      style = MaterialTheme.typography.headlineMedium,
      fontWeight = FontWeight.Bold,
      color = MaterialTheme.colorScheme.primary
    )
    Spacer(modifier = Modifier.height(24.dp))

    // ========== ACCOUNT SECTION ==========
    Text(
      text = "Supabase Account",
      style = MaterialTheme.typography.titleMedium,
      fontWeight = FontWeight.SemiBold,
      modifier = Modifier.align(Alignment.Start)
    )
    Spacer(modifier = Modifier.height(8.dp))

    Card(
      modifier = Modifier.fillMaxWidth(),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
    ) {
      Column(modifier = Modifier.padding(16.dp)) {
        if (isLoggedIn) {
          Text(
            text = "Signed in as:",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
          )
          Text(
            text = userEmail,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.bodyLarge
          )
          Spacer(modifier = Modifier.height(8.dp))
          Text(
            text = "Device ID: ${syncQueue.getDeviceId()}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
          )
          Spacer(modifier = Modifier.height(16.dp))
          Button(
            onClick = {
              auth.signOut()
              isLoggedIn = false
              userEmail = ""
              loginEmail = ""
              loginPassword = ""
            },
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            modifier = Modifier.fillMaxWidth()
          ) {
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
            Spacer(modifier = Modifier.height(8.dp))
            Text(
              text = loginError,
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.error
            )
          }
          Spacer(modifier = Modifier.height(16.dp))
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
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary
              )
              Spacer(modifier = Modifier.width(8.dp))
            }
            Text(if (isLoggingIn) "Signing in..." else "Sign In")
          }
        }
      }
    }

    Spacer(modifier = Modifier.height(24.dp))
    HorizontalDivider()
    Spacer(modifier = Modifier.height(24.dp))

    // ========== SERVER SECTION ==========
    Text(
      text = "Server Configuration",
      style = MaterialTheme.typography.titleMedium,
      fontWeight = FontWeight.SemiBold,
      modifier = Modifier.align(Alignment.Start)
    )
    Spacer(modifier = Modifier.height(8.dp))

    Card(
      modifier = Modifier.fillMaxWidth(),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
    ) {
      Column(modifier = Modifier.padding(16.dp)) {
        OutlinedTextField(
          value = serverUrl,
          onValueChange = { serverUrl = it; serverUrlSaved = false },
          label = { Text("Backend Server URL") },
          placeholder = { Text("http://192.168.1.x:3000") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(12.dp))
        Button(
          onClick = {
            syncQueue.setServerUrl(serverUrl.trim())
            serverUrlSaved = true
          },
          enabled = serverUrl.isNotBlank() && !serverUrlSaved,
          modifier = Modifier.fillMaxWidth()
        ) {
          Text(if (serverUrlSaved) "Saved" else "Save URL")
        }
      }
    }

    Spacer(modifier = Modifier.height(24.dp))
    HorizontalDivider()
    Spacer(modifier = Modifier.height(24.dp))

    // ========== PERMISSIONS SECTION ==========
    Text(
      text = "System Permissions",
      style = MaterialTheme.typography.titleMedium,
      fontWeight = FontWeight.SemiBold,
      modifier = Modifier.align(Alignment.Start)
    )
    Spacer(modifier = Modifier.height(8.dp))

    Card(
      modifier = Modifier.fillMaxWidth(),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
    ) {
      Column(modifier = Modifier.padding(16.dp)) {
        // Usage Stats Permission Row
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Column(modifier = Modifier.weight(1f)) {
            Text("Usage Access Permission", fontWeight = FontWeight.Bold)
            Text(
              text = if (hasUsagePermission) "Granted" else "Required for app tracking",
              style = MaterialTheme.typography.bodySmall,
              color = if (hasUsagePermission) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
            )
          }
          if (!hasUsagePermission) {
            Button(
              onClick = {
                context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                  flags = Intent.FLAG_ACTIVITY_NEW_TASK
                })
              }
            ) {
              Text("Grant")
            }
          }
        }

        Spacer(modifier = Modifier.height(16.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(16.dp))

        // Notification Listener Permission Row
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Column(modifier = Modifier.weight(1f)) {
            Text("Notification Access", fontWeight = FontWeight.Bold)
            Text(
              text = if (hasNotifAccess) "Granted" else "Required for notification stats",
              style = MaterialTheme.typography.bodySmall,
              color = if (hasNotifAccess) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
            )
          }
          if (!hasNotifAccess) {
            Button(
              onClick = {
                context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                  flags = Intent.FLAG_ACTIVITY_NEW_TASK
                })
              }
            ) {
              Text("Grant")
            }
          }
        }
      }
    }

    Spacer(modifier = Modifier.height(24.dp))
    HorizontalDivider()
    Spacer(modifier = Modifier.height(24.dp))

    // ========== UPDATE SECTION ==========
    Text(
      text = "App Updates",
      style = MaterialTheme.typography.titleMedium,
      fontWeight = FontWeight.SemiBold,
      modifier = Modifier.align(Alignment.Start)
    )
    Spacer(modifier = Modifier.height(8.dp))

    Card(
      modifier = Modifier.fillMaxWidth(),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
    ) {
      Column(modifier = Modifier.padding(16.dp)) {
        if (updateInfo != null) {
          Text(
            text = "Version ${updateInfo!!.versionName} available!",
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary
          )
          Spacer(modifier = Modifier.height(8.dp))
          Button(
            onClick = {
              updater.downloadAndInstall(updateInfo!!)
              updateStatus = "Downloading update..."
            },
            modifier = Modifier.fillMaxWidth()
          ) {
            Text("Download & Install")
          }
        } else {
          if (updateStatus.isNotEmpty()) {
            Text(
              text = updateStatus,
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
          }
          Button(
            onClick = {
              isCheckingUpdate = true
              updateStatus = ""
              scope.launch {
                val result = updater.checkForUpdate(force = true)
                isCheckingUpdate = false
                if (result != null) {
                  updateInfo = result
                } else {
                  updateStatus = "You're on the latest version."
                }
              }
            },
            enabled = !isCheckingUpdate,
            modifier = Modifier.fillMaxWidth()
          ) {
            if (isCheckingUpdate) {
              CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary
              )
              Spacer(modifier = Modifier.width(8.dp))
            }
            Text(if (isCheckingUpdate) "Checking..." else "Check for Updates")
          }
        }
      }
    }

    Spacer(modifier = Modifier.height(24.dp))
  }
}
