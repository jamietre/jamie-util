namespace WinCalendar.Models;

public record ReminderStage(int MinutesBefore, int SnoozeMinutes, bool IsOverdue, bool IsFinal);
