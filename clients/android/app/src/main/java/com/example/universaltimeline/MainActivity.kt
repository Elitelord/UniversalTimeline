package com.example.universaltimeline

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.example.universaltimeline.sync.AutoUpdater
import com.example.universaltimeline.theme.UniversalTimelineTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    enableEdgeToEdge()
    setContent {
      UniversalTimelineTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
          val context = LocalContext.current
          val scope = rememberCoroutineScope()
          var updateInfo by remember { mutableStateOf<AutoUpdater.UpdateInfo?>(null) }
          val updater = remember { AutoUpdater(context) }

          // Check for updates once per day on startup
          LaunchedEffect(Unit) {
            val result = updater.checkForUpdate()
            if (result != null) {
              updateInfo = result
            }
          }

          MainNavigation()

          // Show update dialog if a newer version is available
          if (updateInfo != null) {
            AlertDialog(
              onDismissRequest = { updateInfo = null },
              title = { Text("Update Available") },
              text = { Text("Version ${updateInfo!!.versionName} is available. Would you like to download and install it now?") },
              confirmButton = {
                TextButton(onClick = {
                  updater.downloadAndInstall(updateInfo!!)
                  updateInfo = null
                }) {
                  Text("Update Now")
                }
              },
              dismissButton = {
                TextButton(onClick = { updateInfo = null }) {
                  Text("Later")
                }
              }
            )
          }
        }
      }
    }
  }
}
