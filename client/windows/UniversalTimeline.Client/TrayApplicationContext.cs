using System.Linq;
using System.Net.Http.Json;
using System.Reflection;
using System.Text.Json;
using Velopack;

namespace UniversalTimeline.Client;

/// <summary>
/// Manages the system tray icon, context menu, and application lifecycle.
/// No main window is shown — the app lives entirely in the system tray.
/// Wires together ActivityTracker (detection) and SyncQueue (upload).
/// Uses SupabaseAuth for automated JWT acquisition and token refreshing.
/// </summary>
public class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _trayIcon;
    private readonly HttpClient _httpClient;
    private readonly ActivityTracker _tracker;
    private readonly SyncQueue _syncQueue;
    private readonly SupabaseAuth _auth;
    private readonly ToolStripMenuItem _trackingItem;
    private readonly ToolStripMenuItem _statusItem;
    private readonly ToolStripMenuItem _authItem;
    private readonly System.Threading.Timer _refreshTimer;
    private readonly System.Threading.Timer _updateTimer;

    public TrayApplicationContext()
    {
        var backendUrl = GetConfigValue("BackendApiUrl", "BACKEND_API_URL");
        if (string.IsNullOrEmpty(backendUrl))
        {
            backendUrl = "http://localhost:3001"; // Fallback for local debugging
        }

        _httpClient = new HttpClient
        {
            BaseAddress = new Uri(backendUrl),
            Timeout = TimeSpan.FromSeconds(15)
        };

        // Initialize Supabase Authentication service
        _auth = new SupabaseAuth();
        _auth.OnTokenChanged += OnTokenChanged;

        // Initialize sync queue
        _syncQueue = new SyncQueue(_httpClient);

        // Map authentication changes to the SyncQueue
        if (_auth.IsAuthenticated)
        {
            _syncQueue.SetAccessToken(_auth.AccessToken!);
        }

        // Initialize the activity tracker
        _tracker = new ActivityTracker();
        _tracker.OnEventCompleted += evt => _syncQueue.Enqueue(evt);
        _tracker.OnPollTick += OnPollTick;
        _tracker.OnIdleStateChanged += OnIdleStateChanged;

        // Build context menu
        var contextMenu = new ContextMenuStrip();

        _statusItem = new ToolStripMenuItem("Universal Timeline")
        {
            Enabled = false,
            Font = new Font(contextMenu.Font, FontStyle.Bold)
        };
        contextMenu.Items.Add(_statusItem);

        contextMenu.Items.Add(new ToolStripSeparator());

        _trackingItem = new ToolStripMenuItem("Tracking: Active")
        {
            Checked = true,
            CheckOnClick = true
        };
        _trackingItem.CheckedChanged += OnTrackingToggled;
        contextMenu.Items.Add(_trackingItem);

        var pendingItem = new ToolStripMenuItem("Pending: 0 events") { Enabled = false };
        contextMenu.Items.Add(pendingItem);

        // Update pending count periodically
        var pendingTimer = new System.Windows.Forms.Timer { Interval = 5000 };
        pendingTimer.Tick += (s, e) => pendingItem.Text = $"Pending: {_syncQueue.PendingCount} events";
        pendingTimer.Start();

        contextMenu.Items.Add(new ToolStripSeparator());

        _authItem = new ToolStripMenuItem("Sign In...");
        _authItem.Click += OnAuthItemClick;
        contextMenu.Items.Add(_authItem);

        contextMenu.Items.Add(new ToolStripSeparator());

        var updateItem = new ToolStripMenuItem("Check for Updates");
        updateItem.Click += async (s, e) =>
        {
            updateItem.Enabled = false;
            updateItem.Text = "Checking...";
            await CheckForUpdatesAsync(manual: true);
            updateItem.Text = "Check for Updates";
            updateItem.Enabled = true;
        };
        contextMenu.Items.Add(updateItem);

        contextMenu.Items.Add(new ToolStripSeparator());

        var exitItem = new ToolStripMenuItem("Exit");
        exitItem.Click += OnExit;
        contextMenu.Items.Add(exitItem);

        // Create system tray icon
        _trayIcon = new NotifyIcon
        {
            Icon = CreateDefaultIcon(),
            Text = "Universal Timeline — Tracking",
            Visible = true,
            ContextMenuStrip = contextMenu
        };

        // Setup token auto-refresh timer (every 45 minutes)
        _refreshTimer = new System.Threading.Timer(async _ => 
        {
            if (_auth.IsAuthenticated)
            {
                await _auth.RefreshSessionAsync();
            }
        }, null, TimeSpan.FromMinutes(45), TimeSpan.FromMinutes(45));

        // Setup auto-update timer (every 4 hours)
        _updateTimer = new System.Threading.Timer(async _ => await CheckForUpdatesAsync(), null, TimeSpan.FromMinutes(1), TimeSpan.FromHours(4));

        // Start lifecycle initialization
        InitializeLifecycle();
    }

    private static string GetConfigValue(string key, string envVar)
    {
        var attribute = Assembly.GetExecutingAssembly()
            .GetCustomAttributes<AssemblyMetadataAttribute>()
            .FirstOrDefault(a => a.Key == key);

        if (attribute != null && !string.IsNullOrEmpty(attribute.Value))
        {
            return attribute.Value;
        }
        
        return Environment.GetEnvironmentVariable(envVar) ?? string.Empty;
    }

    private async void InitializeLifecycle()
    {
        UpdateAuthMenuState();

        // Attempt to silently refresh session on startup
        if (_auth.IsAuthenticated)
        {
            bool success = await _auth.RefreshSessionAsync();
            if (!success)
            {
                // Refresh token invalid/expired, prompt for login
                PromptLogin();
            }
        }
        else
        {
            // First time or logged out, prompt for login
            PromptLogin();
        }
    }

    private async Task CheckForUpdatesAsync(bool manual = false)
    {
        try
        {
            var mgr = new UpdateManager("https://github.com/Elitelord/UniversalTimeline");
            if (!mgr.IsInstalled)
            {
                if (manual)
                    _trayIcon.ShowBalloonTip(3000, "Universal Timeline", "Updates are only available for installed versions.", ToolTipIcon.Info);
                return;
            }

            var newVersion = await mgr.CheckForUpdatesAsync();
            if (newVersion != null)
            {
                await mgr.DownloadUpdatesAsync(newVersion);
                
                _trayIcon.ShowBalloonTip(5000, "Update Available", $"Version {newVersion.TargetFullRelease.Version} is ready. Click here to restart.", ToolTipIcon.Info);
                
                if (manual)
                {
                    MessageBox.Show($"Version {newVersion.TargetFullRelease.Version} is ready to install.\n\nYou can click the 'Restart to update' menu item in the system tray to apply it.", "Update Available", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }

                _trayIcon.BalloonTipClicked += (s, e) => mgr.ApplyUpdatesAndRestart(newVersion);
                
                // Add a context menu item for restart
                _statusItem.Text = $"Restart to update to {newVersion.TargetFullRelease.Version}";
                _statusItem.Enabled = true;
                _statusItem.ForeColor = Color.DodgerBlue;
                _statusItem.Click += (s, e) => mgr.ApplyUpdatesAndRestart(newVersion);
            }
            else if (manual)
            {
                MessageBox.Show("You are already running the latest version of Universal Timeline.", "Up to date", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
        catch (Exception ex)
        {
            if (manual)
            {
                MessageBox.Show($"Could not check for updates. Please try again later.\n\nError: {ex.Message}", "Update Check Failed", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }

    private void PromptLogin()
    {
        // Must show form on UI thread
        Application.Idle += ShowLoginFormOnce;
    }

    private void ShowLoginFormOnce(object? sender, EventArgs e)
    {
        Application.Idle -= ShowLoginFormOnce;
        
        using var loginForm = new LoginForm(_auth);
        if (loginForm.ShowDialog() == DialogResult.OK)
        {
            _trayIcon.ShowBalloonTip(2000, "Universal Timeline", "Successfully signed in.", ToolTipIcon.Info);
        }
    }

    private void OnTokenChanged(string? token)
    {
        if (token != null)
        {
            _syncQueue.SetAccessToken(token);
        }
        UpdateAuthMenuState();
    }

    private void UpdateAuthMenuState()
    {
        if (_auth.IsAuthenticated)
        {
            _authItem.Text = "Sign Out";
        }
        else
        {
            _authItem.Text = "Sign In...";
        }
    }

    private void OnAuthItemClick(object? sender, EventArgs e)
    {
        if (_auth.IsAuthenticated)
        {
            _auth.Logout();
            _trayIcon.ShowBalloonTip(2000, "Universal Timeline", "Signed out.", ToolTipIcon.Info);
            PromptLogin();
        }
        else
        {
            PromptLogin();
        }
    }

    private void OnTrackingToggled(object? sender, EventArgs e)
    {
        var isActive = _trackingItem.Checked;
        _tracker.IsPaused = !isActive;
        _trackingItem.Text = isActive ? "Tracking: Active" : "Tracking: Paused";
        UpdateTooltip(isActive ? "Tracking" : "Paused");
    }

    private void OnPollTick(string processName, string windowTitle)
    {
        UpdateTooltip(processName);
    }

    private void OnIdleStateChanged(bool isIdle)
    {
        UpdateTooltip(isIdle ? "Idle" : "Resuming...");
    }

    private void UpdateTooltip(string status)
    {
        var text = $"Universal Timeline — {status}";
        if (text.Length > 63) text = text[..63];

        try { _trayIcon.Text = text; }
        catch { /* cross-thread edge case */ }
    }

    private static Icon CreateDefaultIcon()
    {
        var bitmap = new Bitmap(32, 32);
        using var g = Graphics.FromImage(bitmap);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);

        using var outerBrush = new SolidBrush(Color.FromArgb(39, 39, 42));
        g.FillEllipse(outerBrush, 1, 1, 30, 30);

        using var innerBrush = new SolidBrush(Color.FromArgb(244, 244, 245));
        g.FillEllipse(innerBrush, 6, 6, 20, 20);

        using var pen = new Pen(Color.FromArgb(39, 39, 42), 2f);
        g.DrawLine(pen, 16, 16, 16, 9);
        g.DrawLine(pen, 16, 16, 21, 19);

        var handle = bitmap.GetHicon();
        return Icon.FromHandle(handle);
    }

    private void OnExit(object? sender, EventArgs e)
    {
        _tracker.Flush();
        _syncQueue.FlushSync();

        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        _tracker.Dispose();
        _syncQueue.Dispose();
        _refreshTimer.Dispose();
        _updateTimer.Dispose();
        _httpClient.Dispose();
        Application.Exit();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            _tracker.Dispose();
            _syncQueue.Dispose();
            _refreshTimer.Dispose();
            _updateTimer?.Dispose();
            _httpClient.Dispose();
        }
        base.Dispose(disposing);
    }
}
