using System.Text.Json.Serialization;

namespace UniversalTimeline.Client;

/// <summary>
/// Represents a single tracked activity event, matching the backend's CreateEventDto schema.
/// </summary>
public class ActivityEvent
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [JsonPropertyName("device_id")]
    public string DeviceId { get; set; } = Environment.MachineName;

    [JsonPropertyName("activity_type")]
    public string ActivityType { get; set; } = "other";

    [JsonPropertyName("activity_name")]
    public string ActivityName { get; set; } = "";

    [JsonPropertyName("start_time")]
    public DateTime StartTime { get; set; }

    [JsonPropertyName("end_time")]
    public DateTime? EndTime { get; set; }

    [JsonPropertyName("metadata")]
    public Dictionary<string, object>? Metadata { get; set; }
}
