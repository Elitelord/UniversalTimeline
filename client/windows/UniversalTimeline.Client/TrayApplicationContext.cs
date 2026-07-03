using System.Net.Http.Json;
using System.Text.Json;

namespace UniversalTimeline.Client;

/// <summary>
/// Manages the system tray icon, context menu, and application lifecycle.
/// No main window is shown — the app lives entirely in the system tray.
/// </summary>
public class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _trayIcon;
    private readonly HttpClient _httpClient;

    public TrayApplicationContext()
    {
        _httpClient = new HttpClient
        {
            BaseAddress = new Uri("http://localhost:3001"),
            Timeout = TimeSpan.FromSeconds(10)
        };

        // Build context menu
        var contextMenu = new ContextMenuStrip();

        var statusItem = new ToolStripMenuItem("Universal Timeline")
        {
            Enabled = false,
            Font = new Font(contextMenu.Font, FontStyle.Bold)
        };
        contextMenu.Items.Add(statusItem);

        contextMenu.Items.Add(new ToolStripSeparator());

        var trackingItem = new ToolStripMenuItem("Tracking: Active")
        {
            Checked = true,
            CheckOnClick = true
        };
        trackingItem.CheckedChanged += (s, e) =>
        {
            trackingItem.Text = trackingItem.Checked ? "Tracking: Active" : "Tracking: Paused";
        };
        contextMenu.Items.Add(trackingItem);

        contextMenu.Items.Add(new ToolStripSeparator());

        var exitItem = new ToolStripMenuItem("Exit");
        exitItem.Click += OnExit;
        contextMenu.Items.Add(exitItem);

        // Create system tray icon
        _trayIcon = new NotifyIcon
        {
            Icon = CreateDefaultIcon(),
            Text = "Universal Timeline",
            Visible = true,
            ContextMenuStrip = contextMenu
        };

        _trayIcon.DoubleClick += (s, e) =>
        {
            // Future: open dashboard or settings window
        };
    }

    /// <summary>
    /// Creates a simple programmatic icon (a filled circle) so the app
    /// works without shipping an .ico file.
    /// </summary>
    private static Icon CreateDefaultIcon()
    {
        var bitmap = new Bitmap(32, 32);
        using var g = Graphics.FromImage(bitmap);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);

        // Outer circle (dark zinc)
        using var outerBrush = new SolidBrush(Color.FromArgb(39, 39, 42)); // zinc-800
        g.FillEllipse(outerBrush, 1, 1, 30, 30);

        // Inner circle (light)
        using var innerBrush = new SolidBrush(Color.FromArgb(244, 244, 245)); // zinc-100
        g.FillEllipse(innerBrush, 6, 6, 20, 20);

        // Clock hands
        using var pen = new Pen(Color.FromArgb(39, 39, 42), 2f); // zinc-800
        g.DrawLine(pen, 16, 16, 16, 9);  // hour hand (12 o'clock)
        g.DrawLine(pen, 16, 16, 21, 19); // minute hand (~4 o'clock)

        var handle = bitmap.GetHicon();
        return Icon.FromHandle(handle);
    }

    private void OnExit(object? sender, EventArgs e)
    {
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        _httpClient.Dispose();
        Application.Exit();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            _httpClient.Dispose();
        }
        base.Dispose(disposing);
    }
}
