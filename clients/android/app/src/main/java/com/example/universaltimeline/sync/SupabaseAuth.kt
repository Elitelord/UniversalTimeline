package com.example.universaltimeline.sync

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

import com.example.universaltimeline.BuildConfig

/**
 * Handles Supabase authentication via REST API.
 * Uses Supabase's GoTrue /auth/v1 endpoints for email/password sign-in.
 * Stores the JWT access token and refresh token in SharedPreferences.
 * Automatically refreshes the token when needed.
 */
class SupabaseAuth(private val context: Context) {

  companion object {
    private const val TAG = "SupabaseAuth"
    private const val PREFS_NAME = "supabase_auth"
    private const val KEY_ACCESS_TOKEN = "access_token"
    private const val KEY_REFRESH_TOKEN = "refresh_token"
    private const val KEY_USER_EMAIL = "user_email"
    private const val KEY_EXPIRES_AT = "expires_at"

    val SUPABASE_URL = BuildConfig.SUPABASE_URL
    val SUPABASE_ANON_KEY = BuildConfig.SUPABASE_ANON_KEY
  }

  private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun isLoggedIn(): Boolean = getAccessToken().isNotEmpty()

  fun getAccessToken(): String = prefs.getString(KEY_ACCESS_TOKEN, "") ?: ""
  fun getRefreshToken(): String = prefs.getString(KEY_REFRESH_TOKEN, "") ?: ""
  fun getUserEmail(): String = prefs.getString(KEY_USER_EMAIL, "") ?: ""

  private fun isTokenExpired(): Boolean {
    val expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0)
    // Refresh 60 seconds before actual expiry
    return System.currentTimeMillis() / 1000 >= (expiresAt - 60)
  }

  /**
   * Sign in with email and password. Returns a result with error message if failed.
   */
  suspend fun signIn(email: String, password: String): AuthResult = withContext(Dispatchers.IO) {
    try {
      val url = URL("$SUPABASE_URL/auth/v1/token?grant_type=password")
      val conn = url.openConnection() as HttpURLConnection
      conn.requestMethod = "POST"
      conn.setRequestProperty("Content-Type", "application/json")
      conn.setRequestProperty("apikey", SUPABASE_ANON_KEY)
      conn.setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")
      conn.doOutput = true
      conn.connectTimeout = 10_000
      conn.readTimeout = 10_000

      val body = JSONObject().apply {
        put("email", email)
        put("password", password)
      }

      OutputStreamWriter(conn.outputStream).use { writer ->
        writer.write(body.toString())
        writer.flush()
      }

      val responseCode = conn.responseCode
      val responseBody = if (responseCode in 200..299) {
        conn.inputStream.bufferedReader().readText()
      } else {
        conn.errorStream?.bufferedReader()?.readText() ?: "Unknown error"
      }
      conn.disconnect()

      Log.d(TAG, "Auth response ($responseCode): $responseBody")

      if (responseCode in 200..299) {
        val json = JSONObject(responseBody)
        saveSession(json, email)
        Log.i(TAG, "Signed in as $email")
        AuthResult(success = true)
      } else {
        val errorMsg = try {
          val errJson = JSONObject(responseBody)
          errJson.optString("error_description",
            errJson.optString("msg",
              errJson.optString("message",
                errJson.optString("error", "Login failed (HTTP $responseCode)"))))
        } catch (e: Exception) {
          "Login failed (HTTP $responseCode)"
        }
        Log.w(TAG, "Sign in failed ($responseCode): $responseBody")
        AuthResult(success = false, error = errorMsg)
      }
    } catch (e: Exception) {
      Log.e(TAG, "Sign in error", e)
      AuthResult(success = false, error = "Network error: ${e.message}")
    }
  }

  /**
   * Refresh the access token using the stored refresh token.
   */
  suspend fun refreshSession(): Boolean = withContext(Dispatchers.IO) {
    val refreshToken = getRefreshToken()
    if (refreshToken.isEmpty()) return@withContext false

    try {
      val url = URL("$SUPABASE_URL/auth/v1/token?grant_type=refresh_token")
      val conn = url.openConnection() as HttpURLConnection
      conn.requestMethod = "POST"
      conn.setRequestProperty("Content-Type", "application/json")
      conn.setRequestProperty("apikey", SUPABASE_ANON_KEY)
      conn.doOutput = true
      conn.connectTimeout = 10_000
      conn.readTimeout = 10_000

      val body = JSONObject().apply {
        put("refresh_token", refreshToken)
      }

      OutputStreamWriter(conn.outputStream).use { writer ->
        writer.write(body.toString())
        writer.flush()
      }

      val responseCode = conn.responseCode
      if (responseCode in 200..299) {
        val responseBody = conn.inputStream.bufferedReader().readText()
        val json = JSONObject(responseBody)
        saveSession(json, getUserEmail())
        Log.i(TAG, "Token refreshed successfully")
        conn.disconnect()
        true
      } else {
        Log.w(TAG, "Token refresh failed: $responseCode")
        conn.disconnect()
        false
      }
    } catch (e: Exception) {
      Log.e(TAG, "Token refresh error", e)
      false
    }
  }

  /**
   * Get a valid access token, refreshing if necessary.
   */
  suspend fun getValidToken(): String? {
    if (!isLoggedIn()) return null
    if (isTokenExpired()) {
      val refreshed = refreshSession()
      if (!refreshed) {
        signOut()
        return null
      }
    }
    return getAccessToken()
  }

  fun signOut() {
    prefs.edit().clear().apply()
    Log.i(TAG, "Signed out")
  }

  private fun saveSession(json: JSONObject, email: String) {
    val accessToken = json.getString("access_token")
    val refreshToken = json.getString("refresh_token")
    val expiresIn = json.optLong("expires_in", 3600)
    val expiresAt = (System.currentTimeMillis() / 1000) + expiresIn

    prefs.edit()
      .putString(KEY_ACCESS_TOKEN, accessToken)
      .putString(KEY_REFRESH_TOKEN, refreshToken)
      .putString(KEY_USER_EMAIL, email)
      .putLong(KEY_EXPIRES_AT, expiresAt)
      .apply()
  }

  data class AuthResult(
    val success: Boolean,
    val error: String = ""
  )
}
