using Microsoft.Win32;

namespace UniversalTimeline.Client;

/// <summary>
/// Core tracking loop. Polls the foreground window every 5 seconds,
/// detects application switches, idle periods (2+ min), and screen lock/unlock.
/// </summary>
public class ActivityTracker : IDisposable
{
    private const int IdleThresholdMs = 2 * 60 * 1000; // 2 minutes
    private const int PollIntervalMs = 5_000;           // 5 seconds

    private readonly System.Threading.Timer _pollTimer;

    private string? _currentProcessName;
    private string? _currentWindowTitle;
    private ActivityEvent? _currentEvent;
    private bool _isPaused;
    private bool _isIdle;
    private bool _isScreenLocked;

    /// <summary>
    /// Fires when a completed event (with end_time set) is ready to be synced.
    /// </summary>
    public event Action<ActivityEvent>? OnEventCompleted;

    /// <summary>
    /// Fires on every poll tick with the current process name and window title (for UI display).
    /// </summary>
    public event Action<string, string>? OnPollTick;

    /// <summary>
    /// Fires when idle state changes. Bool = isNowIdle.
    /// </summary>
    public event Action<bool>? OnIdleStateChanged;

    public ActivityTracker()
    {
        // Subscribe to session switch events (lock/unlock)
        SystemEvents.SessionSwitch += OnSessionSwitch;

        // Poll every 5 seconds, start after 1 second
        _pollTimer = new System.Threading.Timer(PollCallback, null,
            TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(PollIntervalMs));
    }

    public bool IsPaused
    {
        get => _isPaused;
        set
        {
            _isPaused = value;
            if (_isPaused)
            {
                CloseCurrentEvent();
            }
        }
    }

    public bool IsIdle => _isIdle;

    private void OnSessionSwitch(object sender, SessionSwitchEventArgs e)
    {
        switch (e.Reason)
        {
            case SessionSwitchReason.SessionLock:
            case SessionSwitchReason.ConsoleDisconnect:
            case SessionSwitchReason.RemoteDisconnect:
                _isScreenLocked = true;
                CloseCurrentEvent();
                OnIdleStateChanged?.Invoke(true);
                break;

            case SessionSwitchReason.SessionUnlock:
            case SessionSwitchReason.ConsoleConnect:
            case SessionSwitchReason.RemoteConnect:
                _isScreenLocked = false;
                _isIdle = false;
                OnIdleStateChanged?.Invoke(false);
                break;
        }
    }

    private void PollCallback(object? state)
    {
        if (_isPaused || _isScreenLocked) return;

        try
        {
            // Check idle time
            var idleMs = Win32.GetIdleTimeMs();
            bool nowIdle = idleMs >= IdleThresholdMs;

            if (nowIdle && !_isIdle)
            {
                // Transition to idle — close the current event
                _isIdle = true;
                CloseCurrentEvent();
                OnIdleStateChanged?.Invoke(true);
                return;
            }

            if (!nowIdle && _isIdle)
            {
                // Transition from idle to active
                _isIdle = false;
                OnIdleStateChanged?.Invoke(false);
                // Fall through to start tracking the current window
            }

            if (_isIdle) return; // Still idle, nothing to track

            var hWnd = Win32.GetForegroundWindow();
            if (hWnd == IntPtr.Zero) return;

            var windowTitle = Win32.GetWindowTitle(hWnd);
            var processName = Win32.GetProcessName(hWnd);

            if (string.IsNullOrEmpty(processName)) return;

            OnPollTick?.Invoke(processName, windowTitle);

            // Detect app switch
            bool appSwitched = !string.Equals(_currentProcessName, processName, StringComparison.OrdinalIgnoreCase);

            if (appSwitched)
            {
                CloseCurrentEvent();
                StartNewEvent(processName, windowTitle);
            }
            else
            {
                // Same app — update the window title in metadata (e.g. tab changes)
                _currentWindowTitle = windowTitle;
                if (_currentEvent?.Metadata != null)
                {
                    _currentEvent.Metadata["window_title"] = windowTitle;
                }
            }
        }
        catch
        {
            // Swallow exceptions in the poll loop to keep the timer alive
        }
    }

    private void StartNewEvent(string processName, string windowTitle)
    {
        _currentProcessName = processName;
        _currentWindowTitle = windowTitle;
        _currentEvent = new ActivityEvent
        {
            ActivityName = GetDisplayName(processName, windowTitle),
            ActivityType = ClassifyActivity(processName),
            StartTime = DateTime.UtcNow,
            Metadata = new Dictionary<string, object>
            {
                ["process_name"] = processName,
                ["window_title"] = windowTitle
            }
        };
    }

    private void CloseCurrentEvent()
    {
        if (_currentEvent == null) return;

        _currentEvent.EndTime = DateTime.UtcNow;

        // Only emit events longer than 2 seconds to filter out transient flickers
        var duration = _currentEvent.EndTime.Value - _currentEvent.StartTime;
        if (duration.TotalSeconds >= 2)
        {
            OnEventCompleted?.Invoke(_currentEvent);
        }

        _currentEvent = null;
        _currentProcessName = null;
        _currentWindowTitle = null;
    }

    /// <summary>
    /// Derives a user-friendly display name from the process.
    /// For browsers, extracts the page title from the window title.
    /// </summary>
    private static string GetDisplayName(string processName, string windowTitle)
    {
        var lower = processName.ToLowerInvariant();

        // Browsers: window title is typically "Page Title - Browser Name"
        if (IsBrowser(lower) && !string.IsNullOrEmpty(windowTitle))
        {
            var separators = new[] { " - Google Chrome", " - Mozilla Firefox", " — Mozilla Firefox",
                                     " - Microsoft Edge", " - Brave", " - Opera", " - Vivaldi" };
            foreach (var sep in separators)
            {
                int idx = windowTitle.LastIndexOf(sep, StringComparison.OrdinalIgnoreCase);
                if (idx > 0)
                {
                    return windowTitle[..idx].Trim();
                }
            }
            return windowTitle;
        }

        return processName switch
        {
            "Code" or "code" => "VSCode",
            "devenv" => "Visual Studio",
            "idea64" or "idea" => "IntelliJ IDEA",
            "rider64" or "rider" => "JetBrains Rider",
            "slack" => "Slack",
            "Discord" or "discord" => "Discord",
            "Teams" or "ms-teams" => "Microsoft Teams",
            "WINWORD" => "Microsoft Word",
            "EXCEL" => "Microsoft Excel",
            "POWERPNT" => "Microsoft PowerPoint",
            "Notion" => "Notion",
            "Obsidian" => "Obsidian",
            "figma" or "Figma" => "Figma",
            "explorer" => "File Explorer",
            "WindowsTerminal" => "Windows Terminal",
            _ => processName
        };
    }

    /// <summary>
    /// Classifies the process into an activity category.
    /// </summary>
    private static string ClassifyActivity(string processName)
    {
        var lower = processName.ToLowerInvariant();

        if (IsBrowser(lower))
            return "browsing";

        if (lower is "code" or "devenv" or "idea64" or "idea" or "rider64" or "rider"
            or "android studio" or "webstorm64" or "pycharm64" or "clion64"
            or "windowsterminal" or "cmd" or "powershell" or "pwsh"
            or "wt" or "alacritty" or "hyper")
            return "coding";

        if (lower is "slack" or "discord" or "teams" or "ms-teams" or "zoom"
            or "telegram" or "signal" or "whatsapp" or "thunderbird" or "outlook")
            return "communication";

        if (lower is "figma" or "photoshop" or "illustrator" or "sketch"
            or "xd" or "inkscape" or "gimp" or "blender" or "afterfx")
            return "design";

        if (lower is "notion" or "obsidian" or "onenote" or "evernote"
            or "winword" or "excel" or "powerpnt" or "acrobat")
            return "productivity";

        return "other";
    }

    private static bool IsBrowser(string processNameLower) =>
        processNameLower is "chrome" or "firefox" or "msedge" or "brave"
        or "opera" or "vivaldi" or "arc" or "iexplore";

    /// <summary>
    /// Forces the current event to close (used on app exit or pause).
    /// </summary>
    public void Flush()
    {
        CloseCurrentEvent();
    }

    public void Dispose()
    {
        _pollTimer.Dispose();
        SystemEvents.SessionSwitch -= OnSessionSwitch;
        CloseCurrentEvent();
    }
}
