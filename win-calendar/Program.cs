using WinCalendar;

// Ensure single instance
using var mutex = new Mutex(true, "WinCalendarApp", out bool createdNew);
if (!createdNew)
{
    MessageBox.Show("Meeting Reminder is already running.", "Meeting Reminder", MessageBoxButtons.OK, MessageBoxIcon.Information);
    return;
}

Application.EnableVisualStyles();
Application.SetCompatibleTextRenderingDefault(false);
Application.SetHighDpiMode(HighDpiMode.SystemAware);

// Run as a tray application (no main form)
Application.Run(new TrayApplicationContext());
