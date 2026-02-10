using Microsoft.Toolkit.Uwp.Notifications;
using Windows.UI.Notifications;

namespace WinCalendar.UI;

/// <summary>
/// Configuration for a reactive toast notification with data-bound text providers.
/// </summary>
public class ReactiveToastConfig
{
    public string Tag { get; set; } = "";
    public string Group { get; set; } = "";
    public int PollIntervalMs { get; set; } = 1000;
    public List<Func<string>> TextProviders { get; set; } = new();
    public List<ToastButton>? Buttons { get; set; }
    public ToastScenario Scenario { get; set; } = ToastScenario.Reminder;
    public ToastAudio? Audio { get; set; }
    public string? AttributionText { get; set; }
}

/// <summary>
/// A toast notification that reactively updates its content based on text providers.
/// Polls every second (configurable) and updates in-place without flicker.
/// </summary>
public class ReactiveToast : IDisposable
{
    private readonly ReactiveToastConfig _config;
    private readonly System.Windows.Forms.Timer _updateTimer;
    private readonly object _lock = new object();
    private readonly List<string> _cachedValues = new();
    private uint _sequenceNumber = 0;
    private bool _isDisposed = false;
    private Action<string>? _logger;

    public ReactiveToast(ReactiveToastConfig config, Action<string>? logger = null)
    {
        _config = config ?? throw new ArgumentNullException(nameof(config));
        _logger = logger;

        if (string.IsNullOrEmpty(_config.Tag))
            throw new ArgumentException("Tag is required", nameof(config));

        if (_config.TextProviders.Count == 0)
            throw new ArgumentException("At least one text provider is required", nameof(config));

        if (_config.TextProviders.Count > 4)
            throw new ArgumentException("Maximum 4 text providers allowed (Windows toast limitation)", nameof(config));

        // Initialize cached values
        for (int i = 0; i < _config.TextProviders.Count; i++)
        {
            _cachedValues.Add("");
        }

        // Set up update timer (Windows Forms timer runs on UI thread)
        _updateTimer = new System.Windows.Forms.Timer
        {
            Interval = _config.PollIntervalMs
        };
        _updateTimer.Tick += OnTimerTick;
    }

    /// <summary>
    /// Shows the initial toast and starts the update timer.
    /// </summary>
    public void Show()
    {
        lock (_lock)
        {
            if (_isDisposed)
                throw new ObjectDisposedException(nameof(ReactiveToast));

            try
            {
                // Evaluate initial values
                for (int i = 0; i < _config.TextProviders.Count; i++)
                {
                    _cachedValues[i] = _config.TextProviders[i]();
                }

                // Build toast content
                var builder = new ToastContentBuilder()
                    .SetToastScenario(_config.Scenario);

                // Add first line as static title (required, not bindable)
                if (_config.TextProviders.Count > 0)
                {
                    builder.AddText(_cachedValues[0]);
                }

                // Add remaining lines as data-bound adaptive text
                for (int i = 1; i < _config.TextProviders.Count; i++)
                {
                    builder.AddVisualChild(new AdaptiveText
                    {
                        Text = new BindableString($"line{i}")
                    });
                }

                // Add attribution text
                if (!string.IsNullOrEmpty(_config.AttributionText))
                {
                    builder.AddAttributionText(_config.AttributionText);
                }

                // Add buttons
                if (_config.Buttons != null)
                {
                    foreach (var button in _config.Buttons)
                    {
                        builder.AddButton(button);
                    }
                }

                // Add audio
                if (_config.Audio != null)
                {
                    builder.AddAudio(_config.Audio);
                }

                // Create toast notification
                var content = builder.GetToastContent();
                var toast = new ToastNotification(content.GetXml());
                toast.Tag = _config.Tag;
                toast.Group = _config.Group;

                // Set initial data values for data-bound lines (lines 1+)
                toast.Data = new NotificationData();
                for (int i = 1; i < _config.TextProviders.Count; i++)
                {
                    toast.Data.Values[$"line{i}"] = _cachedValues[i];
                }
                toast.Data.SequenceNumber = _sequenceNumber;

                // Show the toast
                ToastNotificationManagerCompat.CreateToastNotifier().Show(toast);

                _logger?.Invoke($"ReactiveToast shown: {_config.Tag}");

                // Start update timer
                _updateTimer.Start();
            }
            catch (Exception ex)
            {
                _logger?.Invoke($"ERROR showing reactive toast: {ex.Message}");
                throw;
            }
        }
    }

    /// <summary>
    /// Manually dismisses the toast and stops updates.
    /// </summary>
    public void Dismiss()
    {
        lock (_lock)
        {
            if (_isDisposed)
                return;

            try
            {
                _updateTimer.Stop();
                ToastNotificationManagerCompat.History.Remove(_config.Tag, _config.Group);
                _logger?.Invoke($"ReactiveToast dismissed: {_config.Tag}");
            }
            catch (Exception ex)
            {
                _logger?.Invoke($"ERROR dismissing reactive toast: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Timer tick handler - evaluates text providers and updates if changed.
    /// </summary>
    private void OnTimerTick(object? sender, EventArgs e)
    {
        lock (_lock)
        {
            if (_isDisposed)
            {
                _updateTimer.Stop();
                return;
            }

            try
            {
                // Evaluate all text providers
                var hasChanges = false;
                var newValues = new List<string>();

                for (int i = 0; i < _config.TextProviders.Count; i++)
                {
                    var newValue = _config.TextProviders[i]();
                    newValues.Add(newValue);

                    if (newValue != _cachedValues[i])
                    {
                        hasChanges = true;
                    }
                }

                // Only update if something changed
                if (!hasChanges)
                    return;

                // Note: Line 0 (title) is not bindable, so we can't update it
                // Only update lines 1+ via NotificationData

                // Update cached values
                for (int i = 0; i < newValues.Count; i++)
                {
                    _cachedValues[i] = newValues[i];
                }

                // Create update data (only for bindable lines 1+)
                var data = new NotificationData
                {
                    SequenceNumber = ++_sequenceNumber
                };

                for (int i = 1; i < _config.TextProviders.Count; i++)
                {
                    data.Values[$"line{i}"] = _cachedValues[i];
                }

                // Update the toast
                var result = ToastNotificationManagerCompat.CreateToastNotifier()
                    .Update(data, _config.Tag, _config.Group);

                if (result == NotificationUpdateResult.Failed)
                {
                    // Toast was dismissed by user - stop polling
                    _logger?.Invoke($"ReactiveToast dismissed by user: {_config.Tag}");
                    _updateTimer.Stop();
                }
            }
            catch (Exception ex)
            {
                // If update fails, assume toast was dismissed
                _logger?.Invoke($"ReactiveToast update failed (likely dismissed): {ex.Message}");
                _updateTimer.Stop();
            }
        }
    }

    public void Dispose()
    {
        lock (_lock)
        {
            if (_isDisposed)
                return;

            _isDisposed = true;
            _updateTimer.Stop();
            _updateTimer.Dispose();
        }
    }
}
