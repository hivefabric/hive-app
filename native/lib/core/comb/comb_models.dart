class NodeIdentity {
  NodeIdentity({
    required this.nodeId,
    required this.deviceName,
    required this.platform,
    required this.arch,
    required this.ownedHoneycomb,
    this.cpuCores,
    this.memoryMb,
    this.llmProfiles = const <String>[],
    this.operatingSystemVersion,
    this.kernelVersion,
    this.hostname,
    this.timezone,
    this.locationHint,
    this.deviceType,
    this.runtimeVersion,
    this.agentVersion,
    this.virtualizationType,
    this.gpuDevices = const <String>[],
    this.acceleratorTier,
    this.ownerPolicy,
  });

  final String nodeId;
  final String deviceName;
  final String platform;
  final String arch;
  final bool ownedHoneycomb;
  final int? cpuCores;
  final int? memoryMb;
  final List<String> llmProfiles;
  final String? operatingSystemVersion;
  final String? kernelVersion;
  final String? hostname;
  final String? timezone;
  final String? locationHint;
  final String? deviceType;
  final String? runtimeVersion;
  final String? agentVersion;
  final String? virtualizationType;
  final List<String> gpuDevices;

  /// Coarse accelerator tier reported to the dashboard. Values follow the
  /// AcceleratorSpec taxonomy (cpu | edge-gpu | npu | gpu | server-gpu).
  /// Inferred at runtime by the platform bootstrap.
  final String? acceleratorTier;

  /// Optional H-10 OwnerPolicy declared by the contributor in the Wax UI.
  /// Honeycomb scheduler hard-filters tasks against this before scoring.
  /// Encoded as a free-form map so the wire format can evolve without
  /// touching the Dart core types.
  final Map<String, Object?>? ownerPolicy;

  Map<String, Object?> toJson() => {
        'node_id': nodeId,
        'device_name': deviceName,
        'platform': platform,
        'arch': arch,
        'ownership': ownedHoneycomb ? 'owned' : 'shared',
        if (cpuCores != null) 'cpu_cores': cpuCores,
        if (memoryMb != null) 'memory_mb': memoryMb,
        if (llmProfiles.isNotEmpty) 'llm_profiles': llmProfiles,
        if (operatingSystemVersion != null)
          'operating_system_version': operatingSystemVersion,
        if (kernelVersion != null) 'kernel_version': kernelVersion,
        if (hostname != null) 'hostname': hostname,
        if (timezone != null) 'timezone': timezone,
        if (locationHint != null) 'location_hint': locationHint,
        if (deviceType != null) 'device_type': deviceType,
        if (runtimeVersion != null) 'runtime_version': runtimeVersion,
        if (agentVersion != null) 'agent_version': agentVersion,
        if (virtualizationType != null)
          'virtualization_type': virtualizationType,
        if (gpuDevices.isNotEmpty) 'gpu_devices': gpuDevices,
        if (acceleratorTier != null) 'accelerator_tier': acceleratorTier,
        if (ownerPolicy != null) 'owner_policy': ownerPolicy,
      };
}

class NodeMetrics {
  NodeMetrics({
    required this.cpuUsagePercent,
    required this.memoryUsagePercent,
    required this.activeAgents,
    required this.timestamp,
    this.batteryPercent,
    this.privateIp,
    this.publicIp,
    this.sensorReadings = const <String, double>{},
  });

  final double cpuUsagePercent;
  final double memoryUsagePercent;
  final int activeAgents;
  final DateTime timestamp;
  final double? batteryPercent;
  final String? privateIp;
  final String? publicIp;
  final Map<String, double> sensorReadings;

  Map<String, Object?> toJson() => {
        'cpu_usage_percent': cpuUsagePercent,
        'memory_usage_percent': memoryUsagePercent,
        'active_agents': activeAgents,
        'timestamp': timestamp.toIso8601String(),
        if (batteryPercent != null) 'battery_percent': batteryPercent,
        if (privateIp != null) 'private_ip': privateIp,
        if (publicIp != null) 'public_ip': publicIp,
        if (sensorReadings.isNotEmpty) 'sensor_readings': sensorReadings,
      };
}
