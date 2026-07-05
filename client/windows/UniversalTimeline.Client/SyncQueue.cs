using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace UniversalTimeline.Client;

/// <summary>
/// Durable sync queue that buffers ActivityEvents and periodically flushes them
/// to the backend API. Events are persisted to disk so they survive crashes.
/// </summary>
public class SyncQueue : IDisposable
{
    private const int SyncIntervalSeconds = 60;
    private const int MaxRetries = 3;

    private readonly HttpClient _httpClient;
    private readonly System.Threading.Timer _syncTimer;
    private readonly string _queueFilePath;
    private readonly object _lock = new();

    private List<ActivityEvent> _queue = new();
    private string? _accessToken;
    private int _consecutiveFailures;

    /// <summary>
    /// Fires with a status message when sync occurs (for tray tooltip).
    /// </summary>
    public event Action<string>? OnSyncStatus;

    public SyncQueue(HttpClient httpClient)
    {
        _httpClient = httpClient;

        // Persist queue to AppData so events survive crashes
        var appData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "UniversalTimeline");
        Directory.CreateDirectory(appData);
        _queueFilePath = Path.Combine(appData, "pending_events.json");

        // Load any events that were persisted from a previous session
        LoadFromDisk();

        // Sync every 60 seconds
        _syncTimer = new System.Threading.Timer(SyncCallback, null,
            TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(SyncIntervalSeconds));
    }

    public int PendingCount
    {
        get { lock (_lock) return _queue.Count; }
    }

    /// <summary>
    /// Sets the Supabase access token for authenticated API calls.
    /// </summary>
    public void SetAccessToken(string token)
    {
        _accessToken = token;
    }

    /// <summary>
    /// Enqueues a completed event for sync.
    /// </summary>
    public void Enqueue(ActivityEvent evt)
    {
        lock (_lock)
        {
            _queue.Add(evt);
            SaveToDisk();
        }
    }

    /// <summary>
    /// Attempts an immediate sync (used on app exit).
    /// </summary>
    public void FlushSync()
    {
        SyncCallback(null);
    }

    private async void SyncCallback(object? state)
    {
        List<ActivityEvent> batch;
        lock (_lock)
        {
            if (_queue.Count == 0) return;
            batch = new List<ActivityEvent>(_queue);
        }

        if (string.IsNullOrEmpty(_accessToken))
        {
            OnSyncStatus?.Invoke("Waiting for authentication...");
            return;
        }

        try
        {
            // Set auth header
            _httpClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _accessToken);

            var response = await _httpClient.PostAsJsonAsync("/events/list", batch);

            if (response.IsSuccessStatusCode)
            {
                lock (_lock)
                {
                    // Remove only the events we successfully synced
                    _queue.RemoveRange(0, Math.Min(batch.Count, _queue.Count));
                    SaveToDisk();
                }
                _consecutiveFailures = 0;
                OnSyncStatus?.Invoke($"Synced {batch.Count} events");
            }
            else
            {
                _consecutiveFailures++;
                var body = await response.Content.ReadAsStringAsync();
                OnSyncStatus?.Invoke($"Sync failed ({response.StatusCode}): {body[..Math.Min(body.Length, 100)]}");
            }
        }
        catch (Exception ex)
        {
            _consecutiveFailures++;
            OnSyncStatus?.Invoke($"Sync error: {ex.Message[..Math.Min(ex.Message.Length, 80)]}");
        }
    }

    private void SaveToDisk()
    {
        try
        {
            var json = JsonSerializer.Serialize(_queue, new JsonSerializerOptions { WriteIndented = false });
            File.WriteAllText(_queueFilePath, json);
        }
        catch
        {
            // Best-effort persistence
        }
    }

    private void LoadFromDisk()
    {
        try
        {
            if (!File.Exists(_queueFilePath)) return;
            var json = File.ReadAllText(_queueFilePath);
            var loaded = JsonSerializer.Deserialize<List<ActivityEvent>>(json);
            if (loaded != null)
            {
                _queue = loaded;
                OnSyncStatus?.Invoke($"Loaded {_queue.Count} pending events from disk");
            }
        }
        catch
        {
            // Corrupt file — start fresh
            _queue = new List<ActivityEvent>();
        }
    }

    public void Dispose()
    {
        _syncTimer.Dispose();
        lock (_lock) SaveToDisk();
    }
}
