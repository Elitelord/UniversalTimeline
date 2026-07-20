package com.example.universaltimeline

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.example.universaltimeline.ui.dashboard.DashboardScreen
import com.example.universaltimeline.ui.stats.LocalStatsScreen
import com.example.universaltimeline.ui.settings.SettingsScreen

@Composable
fun MainNavigation() {
  val backStack = rememberNavBackStack(Main)

  NavDisplay(
    backStack = backStack,
    onBack = { backStack.removeLastOrNull() },
    entryProvider =
      entryProvider {
        entry<Main> {
          MainTabContainer(modifier = Modifier.safeDrawingPadding())
        }
      },
  )
}

@Composable
fun MainTabContainer(modifier: Modifier = Modifier) {
  var selectedTab by remember { mutableStateOf(0) }

  Scaffold(
    modifier = modifier.fillMaxSize(),
    bottomBar = {
      NavigationBar {
        NavigationBarItem(
          selected = selectedTab == 0,
          onClick = { selectedTab = 0 },
          icon = { Icon(Icons.Default.Home, contentDescription = "Dashboard") },
          label = { Text("Dashboard") }
        )
        NavigationBarItem(
          selected = selectedTab == 1,
          onClick = { selectedTab = 1 },
          icon = { Icon(Icons.Default.List, contentDescription = "Stats") },
          label = { Text("Stats") }
        )
        NavigationBarItem(
          selected = selectedTab == 2,
          onClick = { selectedTab = 2 },
          icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
          label = { Text("Settings") }
        )
      }
    }
  ) { innerPadding ->
    val screenModifier = Modifier.padding(innerPadding)
    when (selectedTab) {
      0 -> DashboardScreen(modifier = screenModifier)
      1 -> LocalStatsScreen(modifier = screenModifier)
      2 -> SettingsScreen(modifier = screenModifier)
    }
  }
}
