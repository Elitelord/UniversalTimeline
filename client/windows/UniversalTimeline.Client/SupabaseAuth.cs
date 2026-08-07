using System.Net.Http.Json;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Linq;

namespace UniversalTimeline.Client;

public class SupabaseAuth
{
    private static readonly string SupabaseUrl = GetConfigValue("SupabaseUrl", "SUPABASE_URL");
    private static readonly string SupabaseAnonKey = GetConfigValue("SupabaseAnonKey", "SUPABASE_ANON_KEY");

    private static string GetConfigValue(string metadataKey, string envKey)
    {
        var attributes = Assembly.GetExecutingAssembly().GetCustomAttributes<AssemblyMetadataAttribute>();
        var metadataValue = attributes.FirstOrDefault(a => a.Key == metadataKey)?.Value;
        if (!string.IsNullOrEmpty(metadataValue))
        {
            return metadataValue;
        }
        return Environment.GetEnvironmentVariable(envKey) ?? "";
    }

    private readonly HttpClient _authClient;
    private readonly string _sessionFilePath;
    private SessionData? _currentSession;

    public event Action<string?>? OnTokenChanged;

    public SupabaseAuth()
    {
        _authClient = new HttpClient();
        _authClient.DefaultRequestHeaders.Add("apikey", SupabaseAnonKey);

        var appData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "UniversalTimeline");
        Directory.CreateDirectory(appData);
        _sessionFilePath = Path.Combine(appData, "session.json");

        LoadSession();
    }

    public string? AccessToken => _currentSession?.AccessToken;
    public bool IsAuthenticated => !string.IsNullOrEmpty(AccessToken);

    public async Task<bool> LoginAsync(string email, string password)
    {
        try
        {
            var requestBody = new { email, password };
            var response = await _authClient.PostAsJsonAsync(
                $"{SupabaseUrl}/auth/v1/token?grant_type=password", 
                requestBody
            );

            if (!response.IsSuccessStatusCode)
                return false;

            var session = await response.Content.ReadFromJsonAsync<SessionData>();
            if (session == null || string.IsNullOrEmpty(session.AccessToken))
                return false;

            _currentSession = session;
            SaveSession();
            OnTokenChanged?.Invoke(session.AccessToken);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public async Task<bool> RefreshSessionAsync()
    {
        if (_currentSession == null || string.IsNullOrEmpty(_currentSession.RefreshToken))
            return false;

        try
        {
            var requestBody = new { refresh_token = _currentSession.RefreshToken };
            var response = await _authClient.PostAsJsonAsync(
                $"{SupabaseUrl}/auth/v1/token?grant_type=refresh_token", 
                requestBody
            );

            if (!response.IsSuccessStatusCode)
            {
                // If refresh token is invalid/expired, clear session
                ClearSession();
                return false;
            }

            var session = await response.Content.ReadFromJsonAsync<SessionData>();
            if (session == null || string.IsNullOrEmpty(session.AccessToken))
            {
                ClearSession();
                return false;
            }

            _currentSession = session;
            SaveSession();
            OnTokenChanged?.Invoke(session.AccessToken);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public void Logout()
    {
        ClearSession();
    }

    private void SaveSession()
    {
        try
        {
            var json = JsonSerializer.Serialize(_currentSession);
            File.WriteAllText(_sessionFilePath, json);
        }
        catch { /* best effort */ }
    }

    private void LoadSession()
    {
        try
        {
            if (File.Exists(_sessionFilePath))
            {
                var json = File.ReadAllText(_sessionFilePath);
                _currentSession = JsonSerializer.Deserialize<SessionData>(json);
                if (_currentSession != null)
                {
                    OnTokenChanged?.Invoke(_currentSession.AccessToken);
                }
            }
        }
        catch
        {
            ClearSession();
        }
    }

    private void ClearSession()
    {
        _currentSession = null;
        try
        {
            if (File.Exists(_sessionFilePath))
                File.Delete(_sessionFilePath);
        }
        catch { /* best effort */ }
        OnTokenChanged?.Invoke(null);
    }

    private class SessionData
    {
        [JsonPropertyName("access_token")]
        public string AccessToken { get; set; } = "";

        [JsonPropertyName("refresh_token")]
        public string RefreshToken { get; set; } = "";

        [JsonPropertyName("expires_in")]
        public int ExpiresIn { get; set; }
    }
}
