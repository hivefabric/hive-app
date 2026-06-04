import 'dart:io';
import 'dart:ffi';

import '../core/agents/agent_manager.dart';
import '../core/agents/agent_model.dart';
import '../core/comb/comb_models.dart';
import '../core/comb/comb_node_manager.dart';
import '../core/control_plane/control_plane_client.dart';
import '../core/runtime/honeycomb_runtime.dart';
import '../infrastructure/background/hive_node_bridge.dart';
import '../infrastructure/persistence/honeycomb_config.dart';

class NodeIdentityHints {
  const NodeIdentityHints({
    this.deviceName,
    this.platform,
    this.architecture,
    this.cpuCores,
    this.memoryMb,
    this.llmProfiles,
    this.operatingSystemVersion,
    this.kernelVersion,
    this.hostname,
    this.timezone,
    this.locationHint,
    this.deviceType,
    this.runtimeVersion,
    this.agentVersion,
    this.virtualizationType,
    this.gpuDevices,
    this.acceleratorTier,
    this.ownerPolicy,
  });

  final String? deviceName;
  final String? platform;
  final String? architecture;
  final int? cpuCores;
  final int? memoryMb;
  final List<String>? llmProfiles;
  final String? operatingSystemVersion;
  final String? kernelVersion;
  final String? hostname;
  final String? timezone;
  final String? locationHint;
  final String? deviceType;
  final String? runtimeVersion;
  final String? agentVersion;
  final String? virtualizationType;
  final List<String>? gpuDevices;
  final String? acceleratorTier;
  final Map<String, Object?>? ownerPolicy;
}

class InMemoryAgentRepository implements AgentRepository {
  final List<AgentRuntime> _desired = <AgentRuntime>[];

  @override
  Future<void> initialize() async {}

  @override
  Future<List<AgentRuntime>> loadDesiredAgents() async =>
      List<AgentRuntime>.from(_desired);

  @override
  Future<void> persistRuntime(AgentRuntime runtime) async {}
}

Future<HoneycombRuntime> buildRuntime(
  HoneycombConfig config, {
  required String configPath,
  NodeIdentityHints? identityHints,
  Future<NodeTelemetryExtras> Function()? telemetryProvider,
}) async {
  final bridge = HiveNodeBridge(
    configPath: configPath,
    controlPlaneHttpUrl: config.controlPlaneHttpUrl,
    authToken: config.authToken,
    nodeId: config.nodeId,
    libraryPath: config.sdkLibraryPath,
    sdkCommand: config.sdkCommand,
    telemetryProvider: telemetryProvider,
  );

  await bridge.initialize();
  final preview = await bridge.bootstrapPreview();
  final fallbackCpuCores =
      Platform.numberOfProcessors > 0 ? Platform.numberOfProcessors : 1;
  final fallbackMemoryMb = await _estimateTotalMemoryMb();
  final hintCpuCores = identityHints?.cpuCores ?? 0;
  final hintMemoryMb = identityHints?.memoryMb ?? 0;
  final resolvedCpuCores = (preview?.cpuCores ?? 0) > 0
      ? preview!.cpuCores
      : (hintCpuCores > 0 ? hintCpuCores : fallbackCpuCores);
  final resolvedMemoryMb = (preview?.memoryMb ?? 0) > 0
      ? preview!.memoryMb
      : (hintMemoryMb > 0 ? hintMemoryMb : fallbackMemoryMb);
  final resolvedArch = (preview?.architecture ?? '').trim().isNotEmpty &&
          preview!.architecture != 'unknown'
      ? preview.architecture
      : (identityHints?.architecture?.trim().isNotEmpty == true
          ? identityHints!.architecture!.trim()
          : _inferArchitecture());
  final resolvedDeviceName =
      identityHints?.deviceName?.trim().isNotEmpty == true
          ? identityHints!.deviceName!.trim()
          : _resolveDeviceName(config.nodeId);
  final resolvedLlmProfiles =
      ((preview?.llmProfiles ?? identityHints?.llmProfiles ?? const <String>[]))
          .where((p) => p.trim().isNotEmpty)
          .toList(growable: false);
  final resolvedPlatform =
      preview?.platform ?? identityHints?.platform ?? Platform.operatingSystem;

  final comb = CombNodeManager(
    bridge: bridge,
    nodeIdentity: NodeIdentity(
      nodeId: preview?.nodeId ?? config.nodeId,
      deviceName: resolvedDeviceName,
      platform: resolvedPlatform,
      arch: resolvedArch,
      ownedHoneycomb: config.ownedHoneycomb,
      cpuCores: resolvedCpuCores,
      memoryMb: resolvedMemoryMb,
      llmProfiles: resolvedLlmProfiles.isNotEmpty
          ? resolvedLlmProfiles
          : _inferLlmProfiles(
              cpuCores: resolvedCpuCores,
              memoryMb: resolvedMemoryMb,
            ),
      operatingSystemVersion: identityHints?.operatingSystemVersion,
      kernelVersion: identityHints?.kernelVersion,
      hostname: identityHints?.hostname,
      timezone: identityHints?.timezone,
      locationHint: identityHints?.locationHint,
      deviceType: identityHints?.deviceType,
      runtimeVersion: identityHints?.runtimeVersion,
      agentVersion: identityHints?.agentVersion,
      virtualizationType: identityHints?.virtualizationType,
      gpuDevices: identityHints?.gpuDevices ?? const <String>[],
      acceleratorTier: identityHints?.acceleratorTier,
      ownerPolicy: identityHints?.ownerPolicy,
    ),
  );

  final cp = WebSocketControlPlaneClient(
    url: config.controlPlaneUrl,
    authToken: config.authToken,
  );

  final agents = AgentManager(repository: InMemoryAgentRepository());

  return DefaultHoneycombRuntime(
    combNodeManager: comb,
    controlPlaneClient: cp,
    agentManager: agents,
  );
}

Future<int> _estimateTotalMemoryMb() async {
  if (!(Platform.isLinux || Platform.isAndroid)) {
    return 1024;
  }

  try {
    final memInfo = await File('/proc/meminfo').readAsString();
    for (final line in memInfo.split('\n')) {
      if (!line.startsWith('MemTotal:')) continue;
      final parts = line.split(RegExp(r'\s+'));
      if (parts.length < 2) continue;
      final kb = int.tryParse(parts[1]) ?? 0;
      if (kb <= 0) continue;
      final mb = kb ~/ 1024;
      return mb > 0 ? mb : 1024;
    }
  } catch (_) {
    // Ignore and use fallback below.
  }

  return 1024;
}

String _inferArchitecture() {
  final fromEnv = Platform.environment['HONEYCOMB_NODE_ARCH'];
  if (fromEnv != null && fromEnv.trim().isNotEmpty) {
    return fromEnv.trim();
  }
  return Abi.current().toString().replaceFirst('Abi.', '');
}

String _resolveDeviceName(String fallbackNodeId) {
  final fromEnv = Platform.environment['HONEYCOMB_DEVICE_NAME'];
  if (fromEnv != null && fromEnv.trim().isNotEmpty) {
    return fromEnv.trim();
  }
  final host = Platform.localHostname.trim();
  if (host.isNotEmpty) return host;
  return fallbackNodeId;
}

List<String> _inferLlmProfiles({
  required int cpuCores,
  required int memoryMb,
}) {
  if (cpuCores >= 8 && memoryMb >= 12 * 1024) {
    return const <String>['LLM'];
  }
  return const <String>['SLM'];
}
