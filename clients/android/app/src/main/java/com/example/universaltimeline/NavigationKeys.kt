package com.example.universaltimeline

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable data object Main : NavKey
@Serializable data object Dashboard : NavKey
@Serializable data object Stats : NavKey
@Serializable data object SettingsScreen : NavKey
