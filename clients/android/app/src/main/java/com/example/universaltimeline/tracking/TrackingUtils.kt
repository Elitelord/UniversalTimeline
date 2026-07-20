package com.example.universaltimeline.tracking

import android.app.AppOpsManager
import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object TrackingUtils {
  const val PREFS_NAME = "tracking_prefs"
  const val KEY_TRACKING_ENABLED = "tracking_enabled"

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

  fun startTracking(context: Context) {
    val workRequest = PeriodicWorkRequestBuilder<TrackingWorker>(
      15, TimeUnit.MINUTES
    ).build()

    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
      TrackingWorker.WORK_NAME,
      ExistingPeriodicWorkPolicy.KEEP,
      workRequest
    )
  }

  fun stopTracking(context: Context) {
    WorkManager.getInstance(context).cancelUniqueWork(TrackingWorker.WORK_NAME)
  }
}
