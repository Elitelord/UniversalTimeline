package com.example.universaltimeline.sync

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Checks GitHub Releases for newer versions of the app and handles
 * downloading and installing updates. Limits automatic checks to once per day,
 * with a manual "Check for Updates" option available in Settings.
 */
class AutoUpdater(private val context: Context) {

    companion object {
        private const val GITHUB_API_URL =
            "https://api.github.com/repos/Elitelord/UniversalTimeline/releases/latest"
        private const val PREFS_NAME = "auto_updater_prefs"
        private const val KEY_LAST_CHECK = "last_update_check"
        private const val ONE_DAY_MS = 24 * 60 * 60 * 1000L
        private const val APK_ASSET_NAME = "UniversalTimeline-Android.apk"
    }

    data class UpdateInfo(
        val versionName: String,
        val downloadUrl: String,
        val releaseNotes: String
    )

    /**
     * Returns true if the last automatic check was more than 24 hours ago.
     */
    fun shouldCheckAutomatically(): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastCheck = prefs.getLong(KEY_LAST_CHECK, 0)
        return System.currentTimeMillis() - lastCheck > ONE_DAY_MS
    }

    private fun recordCheckTime() {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_LAST_CHECK, System.currentTimeMillis())
            .apply()
    }

    /**
     * Checks GitHub for a newer release. Returns UpdateInfo if a newer version
     * exists, or null if the app is already up to date.
     */
    suspend fun checkForUpdate(force: Boolean = false): UpdateInfo? {
        if (!force && !shouldCheckAutomatically()) return null

        return withContext(Dispatchers.IO) {
            try {
                recordCheckTime()

                val connection = URL(GITHUB_API_URL).openConnection() as HttpURLConnection
                connection.setRequestProperty("Accept", "application/vnd.github+json")
                connection.connectTimeout = 10_000
                connection.readTimeout = 10_000

                if (connection.responseCode != 200) return@withContext null

                val json = connection.inputStream.bufferedReader().readText()
                connection.disconnect()

                val release = JSONObject(json)
                val tagName = release.getString("tag_name") // e.g. "v0.0.3"
                val latestVersion = tagName.removePrefix("v")
                val currentVersion = getCurrentVersion()

                if (!isNewer(latestVersion, currentVersion)) return@withContext null

                // Find the APK asset download URL
                val assets = release.getJSONArray("assets")
                var downloadUrl: String? = null
                for (i in 0 until assets.length()) {
                    val asset = assets.getJSONObject(i)
                    if (asset.getString("name") == APK_ASSET_NAME) {
                        downloadUrl = asset.getString("browser_download_url")
                        break
                    }
                }

                if (downloadUrl == null) return@withContext null

                val releaseNotes = release.optString("body", "Bug fixes and improvements.")

                UpdateInfo(
                    versionName = latestVersion,
                    downloadUrl = downloadUrl,
                    releaseNotes = releaseNotes
                )
            } catch (e: Exception) {
                e.printStackTrace()
                null
            }
        }
    }

    /**
     * Downloads the APK using Android's DownloadManager and triggers install
     * when the download completes.
     */
    fun downloadAndInstall(updateInfo: UpdateInfo) {
        // Clean up any previously downloaded APKs
        val downloadDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
        downloadDir?.listFiles()?.filter { it.name.endsWith(".apk") }?.forEach { it.delete() }

        val request = DownloadManager.Request(Uri.parse(updateInfo.downloadUrl))
            .setTitle("Universal Timeline v${updateInfo.versionName}")
            .setDescription("Downloading update...")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, APK_ASSET_NAME)

        val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val downloadId = downloadManager.enqueue(request)

        // Register receiver to trigger install when download completes
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                if (id == downloadId) {
                    ctx.unregisterReceiver(this)
                    installApk()
                }
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(
                receiver,
                IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                Context.RECEIVER_EXPORTED
            )
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(
                receiver,
                IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            )
        }
    }

    private fun installApk() {
        val apkFile = File(
            context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
            APK_ASSET_NAME
        )
        if (!apkFile.exists()) return

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile
        )

        val installIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
        }

        context.startActivity(installIntent)
    }

    private fun getCurrentVersion(): String {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            packageInfo.versionName ?: "0.0.0"
        } catch (e: Exception) {
            "0.0.0"
        }
    }

    /**
     * Compares two semver version strings. Returns true if [latest] is newer than [current].
     */
    private fun isNewer(latest: String, current: String): Boolean {
        val latestParts = latest.split(".").mapNotNull { it.toIntOrNull() }
        val currentParts = current.split(".").mapNotNull { it.toIntOrNull() }

        for (i in 0 until maxOf(latestParts.size, currentParts.size)) {
            val l = latestParts.getOrElse(i) { 0 }
            val c = currentParts.getOrElse(i) { 0 }
            if (l > c) return true
            if (l < c) return false
        }
        return false
    }
}
