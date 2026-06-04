import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

/// H-10 OwnerPolicy as it travels in REGISTER / HEARTBEAT payloads.
///
/// All fields are configurable by the contributor in the in-app settings
/// screen. Defaults are the safest-first values from the canonical
/// `2026-05-13_hivefabric_vision_review.md` doc:
///
///   only_when_charging: true
///   only_on_wifi:       true
///   battery_min_percent: 30
///   cpu_max_percent:    80
///   thermal_max:        warm
///   quiet_hours_local:  22:00 -> 07:00
///   allowed_sensitivity: ["public"]
///
/// Honeycomb scheduler hard-filters on these (see scheduler.rs hard filter,
/// pre-soft-score). The comb re-checks at task accept (defence in depth).
class OwnerPolicy {
  const OwnerPolicy({
    this.onlyWhenCharging = true,
    this.onlyOnWifi = true,
    this.batteryMinPercent = 30,
    this.cpuMaxPercent = 80,
    this.thermalMax = 'warm',
    this.quietHoursStart = 22,
    this.quietHoursEnd = 7,
    this.allowedSensitivity = const <String>['public'],
    this.blockedCapabilityUrns = const <String>[],
    this.geoTags = const <String>[],
    this.maxTasksPerDay = 0, // 0 = unlimited
    this.maxForeignMinutesPerDay = 0,
  });

  final bool onlyWhenCharging;
  final bool onlyOnWifi;
  final int batteryMinPercent;
  final int cpuMaxPercent;
  final String thermalMax; // cool | warm | hot
  final int quietHoursStart; // 0-23, local hour
  final int quietHoursEnd; // 0-23, local hour
  final List<String> allowedSensitivity;
  final List<String> blockedCapabilityUrns;
  final List<String> geoTags;
  final int maxTasksPerDay;
  final int maxForeignMinutesPerDay;

  Map<String, Object?> toJson() => {
        'only_when_charging': onlyWhenCharging,
        'only_on_wifi': onlyOnWifi,
        'battery_min_percent': batteryMinPercent,
        'cpu_max_percent': cpuMaxPercent,
        'thermal_max': thermalMax,
        'quiet_hours_local': {
          'start_hour': quietHoursStart,
          'end_hour': quietHoursEnd,
        },
        'allowed_sensitivity': allowedSensitivity,
        'blocked_capability_urns': blockedCapabilityUrns,
        'geo_tags': geoTags,
        if (maxTasksPerDay > 0) 'max_tasks_per_day': maxTasksPerDay,
        if (maxForeignMinutesPerDay > 0)
          'max_foreign_minutes_per_day': maxForeignMinutesPerDay,
      };

  static OwnerPolicy fromJson(Map<String, dynamic> json) {
    final qh = (json['quiet_hours_local'] as Map?) ?? const {};
    return OwnerPolicy(
      onlyWhenCharging: json['only_when_charging'] as bool? ?? true,
      onlyOnWifi: json['only_on_wifi'] as bool? ?? true,
      batteryMinPercent: (json['battery_min_percent'] as num?)?.toInt() ?? 30,
      cpuMaxPercent: (json['cpu_max_percent'] as num?)?.toInt() ?? 80,
      thermalMax: json['thermal_max'] as String? ?? 'warm',
      quietHoursStart: (qh['start_hour'] as num?)?.toInt() ?? 22,
      quietHoursEnd: (qh['end_hour'] as num?)?.toInt() ?? 7,
      allowedSensitivity:
          ((json['allowed_sensitivity'] as List?) ?? const ['public'])
              .map((e) => e.toString())
              .toList(growable: false),
      blockedCapabilityUrns:
          ((json['blocked_capability_urns'] as List?) ?? const [])
              .map((e) => e.toString())
              .toList(growable: false),
      geoTags: ((json['geo_tags'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(growable: false),
      maxTasksPerDay: (json['max_tasks_per_day'] as num?)?.toInt() ?? 0,
      maxForeignMinutesPerDay:
          (json['max_foreign_minutes_per_day'] as num?)?.toInt() ?? 0,
    );
  }

  OwnerPolicy copyWith({
    bool? onlyWhenCharging,
    bool? onlyOnWifi,
    int? batteryMinPercent,
    int? cpuMaxPercent,
    String? thermalMax,
    int? quietHoursStart,
    int? quietHoursEnd,
    List<String>? allowedSensitivity,
    List<String>? blockedCapabilityUrns,
    List<String>? geoTags,
    int? maxTasksPerDay,
    int? maxForeignMinutesPerDay,
  }) =>
      OwnerPolicy(
        onlyWhenCharging: onlyWhenCharging ?? this.onlyWhenCharging,
        onlyOnWifi: onlyOnWifi ?? this.onlyOnWifi,
        batteryMinPercent: batteryMinPercent ?? this.batteryMinPercent,
        cpuMaxPercent: cpuMaxPercent ?? this.cpuMaxPercent,
        thermalMax: thermalMax ?? this.thermalMax,
        quietHoursStart: quietHoursStart ?? this.quietHoursStart,
        quietHoursEnd: quietHoursEnd ?? this.quietHoursEnd,
        allowedSensitivity: allowedSensitivity ?? this.allowedSensitivity,
        blockedCapabilityUrns:
            blockedCapabilityUrns ?? this.blockedCapabilityUrns,
        geoTags: geoTags ?? this.geoTags,
        maxTasksPerDay: maxTasksPerDay ?? this.maxTasksPerDay,
        maxForeignMinutesPerDay:
            maxForeignMinutesPerDay ?? this.maxForeignMinutesPerDay,
      );
}

/// Persistent contributor identity & policy storage backed by SharedPreferences.
///
/// Stores:
///  - `wax.node_id` — UUIDv4 generated on first launch, then reused for life
///    of the install. Honeycomb uses this as the stable comb identifier.
///  - `wax.owner_policy` — JSON-encoded [OwnerPolicy].
///
/// Works on Android, iOS, desktop (shared_preferences picks the right backend).
class WaxLocalStore {
  static const String _kNodeId = 'wax.node_id';
  static const String _kPolicy = 'wax.owner_policy';
  static const String _kControlPlaneHost = 'control_plane_host';

  /// Get-or-create a persistent UUIDv4 node_id. Subsequent calls return the
  /// same value so the comb re-registers as itself across app restarts.
  Future<String> getOrCreateNodeId() async {
    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(_kNodeId);
    if (existing != null && existing.trim().isNotEmpty) {
      return existing;
    }
    final fresh = _generateUuidV4();
    await prefs.setString(_kNodeId, fresh);
    return fresh;
  }

  /// Force-set the node_id (used when a config / env var explicitly overrides).
  Future<void> setNodeId(String nodeId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kNodeId, nodeId);
  }

  Future<OwnerPolicy> loadPolicy() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kPolicy);
    if (raw == null || raw.isEmpty) {
      return const OwnerPolicy();
    }
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      return OwnerPolicy.fromJson(decoded);
    } catch (_) {
      return const OwnerPolicy();
    }
  }

  Future<void> savePolicy(OwnerPolicy policy) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kPolicy, jsonEncode(policy.toJson()));
  }

  Future<String?> loadControlPlaneHost() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getString(_kControlPlaneHost);
    if (v == null || v.trim().isEmpty) return null;
    return v.trim();
  }

  Future<void> saveControlPlaneHost(String host) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kControlPlaneHost, host);
  }

  String _generateUuidV4() {
    final bytes = List<int>.generate(16, (_) => Random.secure().nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-'
        '${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-'
        '${hex.substring(16, 20)}-'
        '${hex.substring(20)}';
  }
}
