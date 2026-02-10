namespace WinCalendar.Models;

public class ReminderState
{
    public Dictionary<string, int> MeetingStages { get; set; } = new();
    public Dictionary<string, bool> SkipToStart { get; set; } = new();
    public Dictionary<string, bool> Dismissed { get; set; } = new();
    public Dictionary<string, string> SnoozeUntil { get; set; } = new();
    public Dictionary<string, bool> Hidden { get; set; } = new();
}
