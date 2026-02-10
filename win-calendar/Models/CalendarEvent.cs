namespace WinCalendar.Models;

public class CalendarEvent
{
    public string? Subject { get; set; }
    public string? Start { get; set; }
    public string? End { get; set; }
    public string? Location { get; set; }
    public string? EntryId { get; set; }
    public string? Organizer { get; set; }
    public int RequiredAttendees { get; set; }
    public int OptionalAttendees { get; set; }
}
