using Microsoft.Win32;

namespace UniversalTimeline.Client;

/// <summary>
/// Core tracking loop. Polls the foreground window every 5 seconds, detects
/// application switches, window-title changes for title-significant apps (browser
/// tabs, editor files — debounced ~10s), idle periods (2+ min, with the idle span
/// trimmed from the event), and screen lock/unlock.
/// </summary>
public class ActivityTracker : IDisposable
{
    private const int IdleThresholdMs = 2 * 60 * 1000; // 2 minutes
    private const int PollIntervalMs = 5_000;           // 5 seconds

    // For apps whose window title carries real meaning (browser tabs, editor files,
    // Slack channels), a title change starts a new event. The new title must persist
    // for this many consecutive polls (~10s) before we split, so rapidly-churning
    // titles (media players, progress bars) don't produce a storm of tiny events.
    private const int TitleChangeStabilityPolls = 2;

    private readonly System.Threading.Timer _pollTimer;

    private string? _currentProcessName;
    private string? _currentWindowTitle;
    private ActivityEvent? _currentEvent;
    private string? _pendingTitle;      // candidate new title being debounced
    private int _pendingTitleCount;     // consecutive polls the candidate has held
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
                // Transition to idle — close the current event. Backdate its end to
                // when input actually stopped (~idleMs ago), not now: otherwise the
                // full idle threshold (up to 2 min) is wrongly credited to this app.
                _isIdle = true;
                CloseCurrentEvent(idleMs);
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
                // Same process. If the window title changed and this app's title is
                // meaningful (a browser tab, an editor file, a Slack channel), split
                // into a new event so per-tab / per-file history is preserved rather
                // than a single event that only remembers the last title.
                bool titleChanged =
                    !string.Equals(windowTitle, _currentWindowTitle, StringComparison.Ordinal);

                if (titleChanged && IsTitleSignificant(processName))
                {
                    // Debounce: require the new title to hold for a few polls first.
                    if (string.Equals(windowTitle, _pendingTitle, StringComparison.Ordinal))
                    {
                        _pendingTitleCount++;
                    }
                    else
                    {
                        _pendingTitle = windowTitle;
                        _pendingTitleCount = 1;
                    }

                    if (_pendingTitleCount >= TitleChangeStabilityPolls)
                    {
                        CloseCurrentEvent();
                        StartNewEvent(processName, windowTitle);
                    }
                    // Otherwise leave the current event untouched — the old title
                    // stays its activity_name, and the brief new title isn't recorded
                    // unless it persists long enough to matter.
                }
                else
                {
                    // Title unchanged, or an app whose title isn't meaningful: keep
                    // the latest title in metadata (original behavior) and drop any
                    // in-progress split candidate.
                    _currentWindowTitle = windowTitle;
                    if (_currentEvent?.Metadata != null)
                    {
                        _currentEvent.Metadata["window_title"] = windowTitle;
                    }
                    _pendingTitle = null;
                    _pendingTitleCount = 0;
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
        _pendingTitle = null;
        _pendingTitleCount = 0;
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

    /// <param name="idleMsToSubtract">
    /// When closing because the user went idle, the amount of idle time to trim from
    /// the end so the idle span isn't credited to this app. 0 for normal closes.
    /// </param>
    private void CloseCurrentEvent(long idleMsToSubtract = 0)
    {
        if (_currentEvent == null) return;

        var end = DateTime.UtcNow;
        if (idleMsToSubtract > 0)
        {
            end = end.AddMilliseconds(-idleMsToSubtract);
            // Never let the end precede the start (e.g. an event shorter than the
            // idle threshold that only just began before input stopped).
            if (end < _currentEvent.StartTime)
            {
                end = _currentEvent.StartTime;
            }
        }
        _currentEvent.EndTime = end;

        // Only emit events longer than 2 seconds to filter out transient flickers
        var duration = _currentEvent.EndTime.Value - _currentEvent.StartTime;
        if (duration.TotalSeconds >= 2)
        {
            OnEventCompleted?.Invoke(_currentEvent);
        }

        _currentEvent = null;
        _currentProcessName = null;
        _currentWindowTitle = null;
        _pendingTitle = null;
        _pendingTitleCount = 0;
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
    /// Apps whose window title identifies a distinct activity (a browser tab, an
    /// editor file, a Slack channel, a terminal's cwd, an Explorer folder). For these,
    /// a title change is treated as a new event. Media players and the like are
    /// deliberately absent — their titles churn per track and carry little work signal.
    /// </summary>
    private static bool IsTitleSignificant(string processName)
    {
        var lower = processName.ToLowerInvariant();
        if (IsBrowser(lower)) return true;

        return lower is
            // Editors / IDEs — title is the open file
            "code" or "code - insiders" or "codium" or "cursor" or "windsurf"
            or "antigravity" or "devenv" or "idea64" or "idea" or "rider64" or "rider"
            or "webstorm64" or "pycharm64" or "clion64" or "goland64" or "studio64"
            or "sublime_text" or "nvim" or "vim"
            // Chat — title is the channel / conversation
            or "slack"
            // Terminal — title is the cwd / running command
            or "windowsterminal" or "wt"
            // File manager — title is the folder
            or "explorer";
    }

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
