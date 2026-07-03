namespace UniversalTimeline.Client;

static class Program
{
    [STAThread]
    static void Main()
    {
        // Ensure only one instance runs at a time
        using var mutex = new Mutex(true, "UniversalTimeline.Client.SingleInstance", out bool createdNew);
        if (!createdNew)
        {
            MessageBox.Show("Universal Timeline is already running.", "Universal Timeline", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();

        // Don't show a main window — we run entirely from the system tray
        Application.Run(new TrayApplicationContext());
    }
}