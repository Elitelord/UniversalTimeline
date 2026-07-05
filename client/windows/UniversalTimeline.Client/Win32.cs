using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace UniversalTimeline.Client;

/// <summary>
/// P/Invoke declarations for Win32 APIs used to detect the active foreground window
/// and user idle time.
/// </summary>
internal static partial class Win32
{
    [LibraryImport("user32.dll")]
    internal static partial IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [LibraryImport("user32.dll")]
    internal static partial uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    internal static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    [StructLayout(LayoutKind.Sequential)]
    internal struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    /// <summary>
    /// Gets the window title of the given window handle.
    /// </summary>
    public static string GetWindowTitle(IntPtr hWnd)
    {
        var sb = new StringBuilder(512);
        GetWindowText(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }

    /// <summary>
    /// Gets the process name (e.g. "chrome", "Code") for the given window handle.
    /// Returns null if the process cannot be accessed.
    /// </summary>
    public static string? GetProcessName(IntPtr hWnd)
    {
        GetWindowThreadProcessId(hWnd, out uint pid);
        if (pid == 0) return null;

        try
        {
            using var process = Process.GetProcessById((int)pid);
            return process.ProcessName;
        }
        catch
        {
            // Process may have exited between the call and lookup
            return null;
        }
    }

    /// <summary>
    /// Returns how many milliseconds the user has been idle (no keyboard/mouse input).
    /// </summary>
    public static uint GetIdleTimeMs()
    {
        var info = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>() };
        if (!GetLastInputInfo(ref info))
            return 0;

        return (uint)Environment.TickCount - info.dwTime;
    }
}
