using Microsoft.Toolkit.Uwp.Notifications;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace WinCalendar;

public class ReminderService
{
    public string DataFolder { get; }
    private readonly string _stateFile;
    private readonly string _logFile;
    private readonly CalendarSourceManager _sourceManager;

    private static readonly ReminderStage[] Stages =
    [
        new(15, 10, false, false),   // 15 min before, snooze 10 min
        new(5, 4, false, false),     // 5 min before, snooze 4 min
        new(1, 0, false, false),     // 1 min before, no snooze
        new(0, 0, false, false),     // Meeting start
        new(-1, 0, true, false),     // 1 min overdue
        new(-5, 0, true, true),      // 5 min overdue (final)
    ];

    private DateTime _lastAutomationAlert = DateTime.MinValue;

    private readonly Dictionary<string, ReactiveToast> _activeToasts = new();
    private readonly object _toastsLock = new object();

    public ReminderService()
    {
        DataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config", "win-calendar");
        Directory.CreateDirectory(DataFolder);

        _stateFile = Path.Combine(DataFolder, "reminder-state.json");
        _logFile = Path.Combine(DataFolder, "app.log");

        // Initialize calendar source manager
        _sourceManager = new CalendarSourceManager(Log);
        _sourceManager.OnStaleData += ShowAutomationAlert;

        // Configure sources from AppConfig
        var config = AppConfig.Instance;
        var configChanged = false;
        var disabledSources = new List<string>();

        foreach (var sourceConfig in config.CalendarSources)
        {
            if (!sourceConfig.Enabled)
            {
                Log($"Skipping disabled calendar source: {sourceConfig.DisplayName}");
                continue;
            }

            // Check if Google auth is needed and show dialog
            if (sourceConfig.Type.ToLowerInvariant() == "google" && !string.IsNullOrEmpty(sourceConfig.CredentialsPath))
            {
                var tokenPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    ".config", "win-calendar", "google-token");

                if (!Directory.Exists(tokenPath) || !Directory.EnumerateFiles(tokenPath, "*", SearchOption.AllDirectories).Any())
                {
                    var result = MessageBox.Show(
                        $"Google Calendar authentication is required for '{sourceConfig.DisplayName}'.\n\n" +
                        "This will open a browser window for you to sign in with your Google account.\n\n" +
                        "Click OK to authenticate now, or Cancel to skip this calendar source.",
                        "Google Calendar Authentication Required",
                        MessageBoxButtons.OKCancel,
                        MessageBoxIcon.Information);

                    if (result == DialogResult.Cancel)
                    {
                        Log($"User cancelled Google auth for: {sourceConfig.DisplayName}");
                        sourceConfig.Enabled = false;
                        configChanged = true;
                        continue;
                    }
                }
            }

            ICalendarSource? source = sourceConfig.Type.ToLowerInvariant() switch
            {
                "file" when !string.IsNullOrEmpty(sourceConfig.Path) =>
                    new FileCalendarSource(sourceConfig.Path, Log, sourceConfig.RefreshInterval),
                "google" when !string.IsNullOrEmpty(sourceConfig.CredentialsPath) =>
                    new GoogleCalendarSource(sourceConfig.CredentialsPath, sourceConfig.CalendarId, Log, sourceConfig.RefreshInterval),
                _ => null
            };

            if (source != null)
            {
                if (!source.IsConfigured)
                {
                    // Source is enabled but not properly configured - disable it
                    Log($"Disabling misconfigured source: {sourceConfig.DisplayName}");
                    sourceConfig.Enabled = false;
                    configChanged = true;
                    disabledSources.Add(sourceConfig.DisplayName);
                }
                else
                {
                    _sourceManager.AddSource(source);
                    Log($"Added calendar source: {source.Name}");
                }
            }
        }

        // Save config if we disabled any sources
        if (configChanged)
        {
            config.Save();
            var message = disabledSources.Count == 1
                ? $"Calendar source \"{disabledSources[0]}\" is not properly configured and has been disabled.\n\nCheck that the credentials file exists."
                : $"The following calendar sources are not properly configured and have been disabled:\n\n{string.Join("\n", disabledSources.Select(s => $"  - {s}"))}\n\nCheck that the credentials files exist.";

            MessageBox.Show(message, "Calendar Source Configuration Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        // Fallback to default file source if no sources configured
        if (_sourceManager.Sources.Count == 0)
        {
            var defaultPath = Path.Combine(DataFolder, "calendar-data.json");
            _sourceManager.AddSource(new FileCalendarSource(defaultPath, Log));
            Log("Using default file calendar source (calendar-data.json)");
        }
    }

    public void Log(string message)
    {
        try
        {
            var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} - {message}";
            File.AppendAllText(_logFile, line + Environment.NewLine);
        }
        catch { }
    }

    public List<Meeting> GetUpcomingMeetings()
    {
        // Use Task.Run to avoid deadlock when called from UI thread
        return Task.Run(() => _sourceManager.GetUpcomingMeetingsAsync()).GetAwaiter().GetResult();
    }

    public List<Meeting> GetMeetingsForDate(DateTime date)
    {
        // Use Task.Run to avoid deadlock when called from UI thread
        return Task.Run(() => _sourceManager.GetMeetingsForDateAsync(date)).GetAwaiter().GetResult();
    }

    public static string? GetMeetingUrlPublic(string? location) => GetMeetingUrl(location);

    public void CheckAndNotify()
    {
        var meetings = GetUpcomingMeetings();
        var state = LoadState();
        var now = DateTime.Now;

        Log($"Check: Found {meetings.Count} meetings in next 60 min");

        foreach (var meeting in meetings)
        {
            var key = GetMeetingKey(meeting);
            var currentStage = GetCurrentStage(meeting.MinutesUntilStart);

            if (currentStage < 0) continue;
            if (meeting.MinutesUntilStart < -5) continue;

            var lastStage = state.MeetingStages.GetValueOrDefault(key, -1);

            // Check if dismissed or hidden
            if (state.Dismissed.GetValueOrDefault(key, false)) continue;
            if (state.Hidden.GetValueOrDefault(key, false)) continue;

            // Check if snoozed
            if (state.SnoozeUntil.TryGetValue(key, out var snoozeUntilStr))
            {
                if (DateTime.TryParse(snoozeUntilStr, out var snoozeUntil) && now < snoozeUntil)
                    continue;
                state.SnoozeUntil.Remove(key);
            }

            var skipToStart = state.SkipToStart.GetValueOrDefault(key, false);
            var shouldRemind = false;

            if (skipToStart)
            {
                // Skip to start means show at stage 3+ (meeting start and overdue)
                if (currentStage >= 3 && currentStage > lastStage)
                    shouldRemind = true;
            }
            else
            {
                if (currentStage > lastStage)
                    shouldRemind = true;
            }

            if (shouldRemind)
            {
                Log($"REMINDER: '{meeting.Subject}' stage {currentStage} ({meeting.MinutesUntilStart:F0} min until start)");
                try
                {
                    ShowReminder(meeting, currentStage);
                    Log("Reminder shown successfully");
                }
                catch (Exception ex)
                {
                    Log($"ERROR showing reminder: {ex.Message}");
                }
                state.MeetingStages[key] = currentStage;
            }
        }

        SaveState(state);
    }

    private void ShowReminder(Meeting meeting, int stageIndex)
    {
        var stage = Stages[stageIndex];
        var key = GetMeetingKey(meeting);
        var encodedKey = Uri.EscapeDataString(key);

        // Dismiss any existing reactive toast for this meeting
        DismissReactiveToast(key);

        // Create reactive toast configuration
        var config = new ReactiveToastConfig
        {
            Tag = $"meeting-{key.GetHashCode():X}",
            Group = "meetings",
            PollIntervalMs = 1000,
            AttributionText = "WinCalendar"
        };

        // Line 1 (static): Title based on stage
        config.TextProviders.Add(() =>
        {
            var currentStage = Stages[stageIndex];
            if (currentStage.IsOverdue)
            {
                return currentStage.IsFinal
                    ? "FINAL REMINDER: Meeting Started"
                    : "Meeting Started";
            }
            else if (meeting.MinutesUntilStart <= 0)
            {
                return "Meeting Starting NOW!";
            }
            else
            {
                return "Meeting Reminder";
            }
        });

        // Line 2 (dynamic): Time status
        config.TextProviders.Add(() =>
        {
            var minutesUntil = (meeting.Start - DateTime.Now).TotalMinutes;

            if (minutesUntil <= 0)
            {
                var minutesLate = Math.Abs((int)minutesUntil);
                if (minutesLate == 0)
                    return "Starting NOW!";
                else if (minutesLate == 1)
                    return "Started 1 minute ago";
                else
                    return $"Started {minutesLate} minutes ago";
            }
            else
            {
                var mins = (int)Math.Ceiling(minutesUntil);
                if (mins == 1)
                    return "In 1 minute";
                else
                    return $"In {mins} minutes";
            }
        });

        // Line 3 (dynamic): Meeting subject + location
        config.TextProviders.Add(() =>
        {
            var text = meeting.Subject;
            if (!string.IsNullOrEmpty(meeting.Location))
                text += $"\n{meeting.Location}";
            return text;
        });

        // Check for meeting URL
        var meetingUrl = GetMeetingUrl(meeting.Location);

        // Add buttons based on stage
        config.Buttons = new List<ToastButton>();
        if (stageIndex >= 2)
        {
            // 1 min before or later: Join (if available) + Dismiss
            if (meetingUrl != null)
            {
                var encodedUrl = Uri.EscapeDataString(meetingUrl);
                config.Buttons.Add(new ToastButton()
                    .SetContent("Join")
                    .AddArgument("action", $"join/{encodedKey}/{encodedUrl}"));
            }
            config.Buttons.Add(new ToastButton()
                .SetContent("Dismiss")
                .AddArgument("action", $"dismiss/{encodedKey}"));
        }
        else
        {
            // Earlier stages: Snooze + Remind at start + Dismiss
            if (stage.SnoozeMinutes > 0)
            {
                var snoozeTime = DateTime.Now.AddMinutes(stage.SnoozeMinutes);
                var snoozeTimeStr = snoozeTime.ToString("H:mm");
                var snoozeTimeIso = Uri.EscapeDataString(snoozeTime.ToString("o"));
                config.Buttons.Add(new ToastButton()
                    .SetContent($"Snooze until {snoozeTimeStr}")
                    .AddArgument("action", $"snooze/{encodedKey}/{snoozeTimeIso}"));
            }
            config.Buttons.Add(new ToastButton()
                .SetContent("Remind at start")
                .AddArgument("action", $"skip/{encodedKey}"));
            config.Buttons.Add(new ToastButton()
                .SetContent("Dismiss")
                .AddArgument("action", $"dismiss/{encodedKey}"));
        }

        // Set scenario and audio based on urgency
        var meetingStarted = meeting.MinutesUntilStart <= 0;
        if (stage.IsOverdue)
        {
            // Overdue: urgent looping alarm
            config.Scenario = ToastScenario.Alarm;
            config.Audio = new ToastAudio
            {
                Src = new Uri("ms-winsoundevent:Notification.Looping.Alarm2"),
                Loop = true
            };
        }
        else if (meetingStarted)
        {
            // Meeting starting NOW: attention-grabbing alarm (non-looping)
            config.Scenario = ToastScenario.Alarm;
            config.Audio = new ToastAudio
            {
                Src = new Uri("ms-winsoundevent:Notification.Looping.Alarm")
            };
        }
        else
        {
            // Upcoming reminder: standard reminder sound
            config.Scenario = ToastScenario.Reminder;
            config.Audio = new ToastAudio
            {
                Src = new Uri("ms-winsoundevent:Notification.Reminder")
            };
        }

        // Create and show reactive toast
        var reactiveToast = new ReactiveToast(config, Log);
        lock (_toastsLock)
        {
            _activeToasts[key] = reactiveToast;
        }
        reactiveToast.Show();

        // Screen flash for started/overdue meetings
        if (stage.IsOverdue)
        {
            ShowScreenFlash(Color.OrangeRed, 3);
        }
        else if (meetingStarted)
        {
            ShowScreenFlash(Color.White, 1);
        }
    }

    private void ShowScreenFlash(Color color, int count)
    {
        for (int i = 0; i < count; i++)
        {
            using var form = new Form
            {
                FormBorderStyle = FormBorderStyle.None,
                StartPosition = FormStartPosition.Manual,
                Bounds = Screen.AllScreens.Aggregate(Rectangle.Empty, (r, s) => Rectangle.Union(r, s.Bounds)),
                TopMost = true,
                ShowInTaskbar = false,
                Opacity = 0.7,
                BackColor = color
            };
            form.Show();
            Thread.Sleep(150);
            form.Close();
            Thread.Sleep(150);
        }
    }

    private static string? GetMeetingUrl(string? location)
    {
        if (string.IsNullOrEmpty(location)) return null;

        var pattern = @"https?://(?:[^\s<>""']*\.)?(?:zoom\.us|teams\.microsoft\.com|meet\.google\.com|webex\.com)[^\s<>""']*";
        var match = Regex.Match(location, pattern);
        return match.Success ? match.Value : null;
    }

    private void ShowAutomationAlert(string reason)
    {
        var now = DateTime.Now;
        if ((now - _lastAutomationAlert).TotalMinutes < 10) return;

        _lastAutomationAlert = now;
        Log($"ALERT: {reason}");

        new ToastContentBuilder()
            .AddText("Outlook Calendar Sync Not Running")
            .AddText(reason)
            .SetToastScenario(ToastScenario.Reminder)
            .Show();
    }

    private static int GetCurrentStage(double minutesUntilStart)
    {
        var currentStage = -1;
        for (var i = 0; i < Stages.Length; i++)
        {
            if (minutesUntilStart <= Stages[i].MinutesBefore)
                currentStage = i;
        }
        return currentStage;
    }

    public static string GetMeetingKey(Meeting meeting)
    {
        return $"{meeting.Subject}_{meeting.Start:yyyyMMddHHmm}";
    }

    public void HideMeeting(string key)
    {
        var state = LoadState();
        state.Hidden[key] = true;
        SaveState(state);
        Log($"Hidden meeting: {key}");
    }

    public void UnhideMeeting(string key)
    {
        var state = LoadState();
        state.Hidden.Remove(key);
        SaveState(state);
        Log($"Unhidden meeting: {key}");
    }

    public bool IsMeetingHidden(string key)
    {
        var state = LoadState();
        return state.Hidden.GetValueOrDefault(key, false);
    }

    public void DismissMeeting(string key)
    {
        DismissReactiveToast(key);
        var state = LoadState();
        state.Dismissed[key] = true;
        SaveState(state);
        Log($"Dismissed meeting: {key}");
    }

    public void DismissReactiveToast(string key)
    {
        lock (_toastsLock)
        {
            if (_activeToasts.TryGetValue(key, out var toast))
            {
                toast.Dismiss();
                toast.Dispose();
                _activeToasts.Remove(key);
                Log($"Dismissed reactive toast: {key}");
            }
        }
    }

    public void SkipToStart(string key)
    {
        var state = LoadState();
        state.SkipToStart[key] = true;
        SaveState(state);
        Log($"Skip to start: {key}");
    }

    public void SnoozeMeeting(string key, string untilTime)
    {
        var state = LoadState();
        state.SnoozeUntil[key] = untilTime;
        SaveState(state);
        Log($"Snoozed meeting until {untilTime}: {key}");
    }

    public int ResetUpcomingReminders()
    {
        var state = LoadState();
        var cutoff = DateTime.Now.AddMinutes(-10).ToString("yyyyMMddHHmm");

        var keysToReset = state.MeetingStages.Keys
            .Concat(state.Dismissed.Keys)
            .Concat(state.SnoozeUntil.Keys)
            .Concat(state.Hidden.Keys)
            .Distinct()
            .Where(k =>
            {
                var parts = k.Split('_');
                return parts.Length >= 2 && string.Compare(parts[^1], cutoff, StringComparison.Ordinal) >= 0;
            })
            .ToList();

        foreach (var key in keysToReset)
        {
            state.MeetingStages.Remove(key);
            state.SkipToStart.Remove(key);
            state.Dismissed.Remove(key);
            state.SnoozeUntil.Remove(key);
            state.Hidden.Remove(key);
        }

        SaveState(state);
        Log($"Reset reminders for {keysToReset.Count} upcoming meetings");
        return keysToReset.Count;
    }

    private ReminderState LoadState()
    {
        if (!File.Exists(_stateFile))
            return new ReminderState();

        try
        {
            var json = File.ReadAllText(_stateFile);
            return JsonSerializer.Deserialize<ReminderState>(json) ?? new ReminderState();
        }
        catch
        {
            return new ReminderState();
        }
    }

    private void SaveState(ReminderState state)
    {
        var json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(_stateFile, json);
    }
}

public record ReminderStage(int MinutesBefore, int SnoozeMinutes, bool IsOverdue, bool IsFinal);

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

public class CalendarData
{
    public string? ExportTime { get; set; }
    public List<CalendarEvent>? Events { get; set; }
}

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

public class ReminderState
{
    public Dictionary<string, int> MeetingStages { get; set; } = new();
    public Dictionary<string, bool> SkipToStart { get; set; } = new();
    public Dictionary<string, bool> Dismissed { get; set; } = new();
    public Dictionary<string, string> SnoozeUntil { get; set; } = new();
    public Dictionary<string, bool> Hidden { get; set; } = new();
}
