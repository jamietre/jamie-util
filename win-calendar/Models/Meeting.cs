namespace WinCalendar.Models;

public class Meeting
{
    public string Subject { get; set; } = "";
    public DateTime Start { get; set; }
    public DateTime End { get; set; }
    public string? Location { get; set; }
    public string? EntryId { get; set; }
    public string? Organizer { get; set; }
    public int RequiredAttendees { get; set; }
    public int OptionalAttendees { get; set; }
    public int TotalAttendees => RequiredAttendees + OptionalAttendees;
    public double MinutesUntilStart { get; set; }
    public string? Source { get; set; }
}
