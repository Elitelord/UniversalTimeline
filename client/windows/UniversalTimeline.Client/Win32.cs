using System.IO;
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

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint processAccess, bool bInheritHandle, uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref uint lpdwSize);

    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    /// <summary>
    /// Gets the process name (e.g. "chrome", "Code") for the given window handle natively.
    /// Returns null if the process cannot be accessed.
    /// </summary>
    public static string? GetProcessName(IntPtr hWnd)
    {
        GetWindowThreadProcessId(hWnd, out uint pid);
        if (pid == 0) return null;

        IntPtr hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (hProcess == IntPtr.Zero) return null;

        try
        {
            uint capacity = 1024;
            var sb = new StringBuilder((int)capacity);
            if (QueryFullProcessImageName(hProcess, 0, sb, ref capacity))
            {
                var fullPath = sb.ToString();
                return Path.GetFileNameWithoutExtension(fullPath);
            }
            return null;
        }
        finally
        {
            CloseHandle(hProcess);
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
