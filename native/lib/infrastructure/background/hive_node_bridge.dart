import 'dart:async';
import 'dart:convert';
import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';

import '../../core/comb/comb_models.dart';

typedef _BootstrapPreviewNative = Pointer<Utf8> Function(Pointer<Utf8>);
typedef _BootstrapPreviewDart = Pointer<Utf8> Function(Pointer<Utf8>);
typedef _FreeCStringNative = Void Function(Pointer<Utf8>);
typedef _FreeCStringDart = void Function(Pointer<Utf8>);

class HiveNodeBootstrap {
  HiveNodeBootstrap({
    required this.nodeId,
    required this.platform,
    required this.architecture,
    required this.cpuCores,
    required this.memoryMb,
    required this.llmProfiles,
  });

  final String nodeId;
  final String platform;
  final String architecture;
  final int cpuCores;
  final int memoryMb;
  final List<String> llmProfiles;

  static HiveNodeBootstrap? fromJson(Map<String, dynamic> json) {
    if (json.containsKey('error')) return null;
    return HiveNodeBootstrap(
      nodeId: json['node_id'] as String? ?? 'honeycomb-node',
      platform: json['platform'] as String? ?? Platform.operatingSystem,
      architecture: json['architecture'] as String? ?? 'unknown',
      cpuCores: (json['cpu_cores'] as num?)?.toInt() ?? 0,
      memoryMb: (json['memory_mb'] as num?)?.toInt() ?? 0,
      llmProfiles: (json['llm_profiles'] as List<dynamic>? ?? const [])
          .whereType<String>()
          .toList(growable: false),
    );
  }
}

class NodeTelemetryExtras {
  const NodeTelemetryExtras({
    this.batteryPercent,
    this.privateIp,
    this.publicIp,
    this.sensorReadings = const <String, double>{},
  });

  final double? batteryPercent;
  final String? privateIp;
  final String? publicIp;
  final Map<String, double> sensorReadings;
}

class HiveNodeBridge {
  HiveNodeBridge({
    required this.configPath,
    required this.controlPlaneHttpUrl,
    required this.authToken,
    required this.nodeId,
    this.libraryPath,
    this.sdkCommand,
    this.telemetryProvider,
  });

  final String configPath;
  final String controlPlaneHttpUrl;
  final String authToken;
  final String nodeId;
  final String? libraryPath;
  final String? sdkCommand;
  final Future<NodeTelemetryExtras> Function()? telemetryProvider;

  Process? _headlessNodeProcess;
  String? _deviceLockPath;
  StreamSubscription<String>? _stdoutSub;
  StreamSubscription<String>? _stderrSub;
  DynamicLibrary? _sdkLibrary;
  int? _lastCpuTotalTicks;
  int? _lastCpuIdleTicks;

  Future<void> initialize() async {
    final candidate = _resolveLibraryPath();
    if (candidate != null &&
        candidate.isNotEmpty &&
        File(candidate).existsSync()) {
      _sdkLibrary = DynamicLibrary.open(candidate);
    }
  }

  Future<HiveNodeBootstrap?> bootstrapPreview() async {
    if (_sdkLibrary == null) return null;

    final bootstrap = _sdkLibrary!
        .lookupFunction<_BootstrapPreviewNative, _BootstrapPreviewDart>(
            'hive_node_bootstrap_preview');
    final freeCString = _sdkLibrary!
        .lookupFunction<_FreeCStringNative, _FreeCStringDart>(
            'hive_node_free_string');

    final configPtr = configPath.toNativeUtf8();
    final output = bootstrap(configPtr);
    calloc.free(configPtr);

    final result = output.toDartString();
    freeCString(output);

    final parsed = jsonDecode(result) as Map<String, dynamic>;
    return HiveNodeBootstrap.fromJson(parsed);
  }

  Future<void> startNode() async {
    final command = _resolveStartCommand();
    if (command == null || command.isEmpty) {
      // No SDK runtime command available. Honeycomb can still run in observer mode.
      return;
    }
    await _acquireDeviceLockIfNeeded();
    final listenAddr = _resolveNodeListenAddr();
    final advertisedApiBase = _resolveNodeApiBaseUrl(listenAddr);
    final nodeIdFile = _resolveNodeIdFilePath();
    final virtualizationType = _configuredVirtualizationType();
    final heartbeatIntervalSeconds = _resolveNodeHeartbeatIntervalSeconds();

    try {
      _headlessNodeProcess = await Process.start(
        '/bin/zsh',
        ['-c', command],
        environment: {
          ...Platform.environment,
          'COMB_NODE_CONTROL_PLANE_URL': controlPlaneHttpUrl,
          'COMB_NODE_CONTROL_PLANE_API_KEY': authToken,
          'COMB_NODE_NAME': 'honeycomb-$nodeId',
          'COMB_NODE_LISTEN_ADDR': listenAddr,
          'COMB_NODE_ADVERTISE_NODE_API_BASE_URL': advertisedApiBase,
          'COMB_NODE_NODE_ID_FILE': nodeIdFile,
          'COMB_NODE_HEARTBEAT_INTERVAL_SECONDS': heartbeatIntervalSeconds,
          if (virtualizationType != null)
            'HIVE_VIRTUALIZATION_TYPE': virtualizationType,
          if (configPath.toLowerCase().endsWith('.toml'))
            'COMB_NODE_CONFIG': configPath,
        },
      );
    } catch (_) {
      await _releaseDeviceLock();
      rethrow;
    }

    _stdoutSub = _headlessNodeProcess!.stdout
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen((line) => stdout.writeln('[hive-node] $line'));
    _stderrSub = _headlessNodeProcess!.stderr
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen((line) => stderr.writeln('[hive-node][err] $line'));

    unawaited(_headlessNodeProcess!.exitCode.then((code) {
      stdout.writeln('[hive-node] process exited with code $code');
    }));
  }

  Future<void> stopNode() async {
    if (_headlessNodeProcess != null) {
      _headlessNodeProcess!.kill(ProcessSignal.sigterm);
      await _stdoutSub?.cancel();
      await _stderrSub?.cancel();
      _stdoutSub = null;
      _stderrSub = null;
      _headlessNodeProcess = null;
    }
    await _releaseDeviceLock();
  }

  Future<NodeMetrics> fetchMetrics({required int activeAgents}) async {
    final cpuUsage = await _readCpuUsagePercent();
    final memoryUsage = await _readMemoryUsagePercent();
    NodeTelemetryExtras extras = const NodeTelemetryExtras();
    if (telemetryProvider != null) {
      try {
        extras = await telemetryProvider!();
      } catch (_) {
        extras = const NodeTelemetryExtras();
      }
    }
    return NodeMetrics(
      cpuUsagePercent: cpuUsage,
      memoryUsagePercent: memoryUsage,
      activeAgents: activeAgents,
      timestamp: DateTime.now().toUtc(),
      batteryPercent: extras.batteryPercent,
      privateIp: extras.privateIp,
      publicIp: extras.publicIp,
      sensorReadings: extras.sensorReadings,
    );
  }

  Future<double> _readMemoryUsagePercent() async {
    if (!(Platform.isLinux || Platform.isAndroid)) return 0.0;
    try {
      final memInfo = await File('/proc/meminfo').readAsString();
      int? totalKb;
      int? availableKb;
      for (final line in memInfo.split('\n')) {
        if (line.startsWith('MemTotal:')) {
          final parts = line.split(RegExp(r'\s+'));
          if (parts.length >= 2) {
            totalKb = int.tryParse(parts[1]);
          }
        } else if (line.startsWith('MemAvailable:')) {
          final parts = line.split(RegExp(r'\s+'));
          if (parts.length >= 2) {
            availableKb = int.tryParse(parts[1]);
          }
        }
      }
      if (totalKb == null || totalKb <= 0) return 0.0;
      if (availableKb == null || availableKb < 0) return 0.0;
      final used = totalKb - availableKb;
      final pct = (used * 100.0) / totalKb;
      if (pct.isNaN || pct.isInfinite) return 0.0;
      return pct.clamp(0.0, 100.0).toDouble();
    } catch (_) {
      return 0.0;
    }
  }

  Future<double> _readCpuUsagePercent() async {
    if (!(Platform.isLinux || Platform.isAndroid)) return 0.0;
    try {
      final stat = await File('/proc/stat').readAsLines();
      if (stat.isEmpty) return 0.0;
      final line = stat.firstWhere(
        (l) => l.startsWith('cpu '),
        orElse: () => '',
      );
      if (line.isEmpty) return 0.0;
      final parts =
          line.trim().split(RegExp(r'\s+')).skip(1).toList(growable: false);
      if (parts.length < 4) return 0.0;
      final values = parts.map((p) => int.tryParse(p) ?? 0).toList();
      final idle = values[3] + (values.length > 4 ? values[4] : 0);
      final total = values.fold<int>(0, (sum, v) => sum + v);
      final prevTotal = _lastCpuTotalTicks;
      final prevIdle = _lastCpuIdleTicks;
      _lastCpuTotalTicks = total;
      _lastCpuIdleTicks = idle;
      if (prevTotal == null || prevIdle == null) {
        return 0.0;
      }
      final totalDiff = total - prevTotal;
      final idleDiff = idle - prevIdle;
      if (totalDiff <= 0) return 0.0;
      final usedPct = ((totalDiff - idleDiff) * 100.0) / totalDiff;
      if (usedPct.isNaN || usedPct.isInfinite) return 0.0;
      return usedPct.clamp(0.0, 100.0).toDouble();
    } catch (_) {
      return 0.0;
    }
  }

  String? _resolveLibraryPath() {
    if (libraryPath != null && libraryPath!.isNotEmpty) {
      return libraryPath;
    }

    final fromEnv = Platform.environment['HONEYCOMB_NODE_LIBRARY_PATH'];
    if (fromEnv != null && fromEnv.isNotEmpty) {
      return fromEnv;
    }

    return null;
  }

  String? _resolveStartCommand() {
    final explicit = Platform.environment['HONEYCOMB_NODE_COMMAND'];
    if (explicit != null && explicit.isNotEmpty) {
      return explicit;
    }

    if (sdkCommand != null && sdkCommand!.isNotEmpty) {
      return sdkCommand;
    }

    final root = _resolveWorkspaceRoot();
    if (root != null) {
      final manifest = '$root/hive-sdk/Cargo.toml';
      if (File(manifest).existsSync()) {
        return 'cargo run --manifest-path "$manifest" -p hive-node --example headless_server';
      }
    }

    return null;
  }

  String _resolveNodeListenAddr() {
    final fromEnv = Platform.environment['HONEYCOMB_NODE_LISTEN_ADDR'];
    if (fromEnv != null && fromEnv.isNotEmpty) return fromEnv;
    final fromDefine =
        const String.fromEnvironment('HONEYCOMB_NODE_LISTEN_ADDR');
    if (fromDefine.isNotEmpty) return fromDefine;
    return '0.0.0.0:7070';
  }

  String _resolveNodeApiBaseUrl(String listenAddr) {
    final fromEnv = Platform.environment['HONEYCOMB_NODE_API_BASE_URL'];
    if (fromEnv != null && fromEnv.isNotEmpty) return fromEnv;
    final fromDefine =
        const String.fromEnvironment('HONEYCOMB_NODE_API_BASE_URL');
    if (fromDefine.isNotEmpty) return fromDefine;

    final parts = listenAddr.split(':');
    final port = parts.length > 1 ? parts.last : '7070';
    // Control-plane runs in Docker quickrun; use host.docker.internal by default.
    return 'http://host.docker.internal:$port';
  }

  String _resolveNodeIdFilePath() {
    final fromEnv = Platform.environment['HONEYCOMB_NODE_ID_FILE'];
    if (fromEnv != null && fromEnv.isNotEmpty) return fromEnv;
    final fromDefine = const String.fromEnvironment('HONEYCOMB_NODE_ID_FILE');
    if (fromDefine.isNotEmpty) return fromDefine;

    final home = Platform.environment['HOME'];
    if (home != null && home.isNotEmpty) {
      final safeNodeId = nodeId.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
      return '$home/.honeycomb/node_ids/$safeNodeId.node_id';
    }
    return '.honeycomb/node_ids/$nodeId.node_id';
  }

  String _resolveNodeHeartbeatIntervalSeconds() {
    final fromEnv =
        Platform.environment['HONEYCOMB_NODE_HEARTBEAT_INTERVAL_SECONDS'];
    if (fromEnv != null && fromEnv.isNotEmpty) return fromEnv;
    final fromDefine = const String.fromEnvironment(
        'HONEYCOMB_NODE_HEARTBEAT_INTERVAL_SECONDS');
    if (fromDefine.isNotEmpty) return fromDefine;
    // Faster default for local/operator UX while remaining safe for lease renewal.
    return '3';
  }

  Future<void> _acquireDeviceLockIfNeeded() async {
    if (_allowMultiInstance()) {
      return;
    }

    final lockPath = _resolveDeviceLockPath();
    final lockFile = File(lockPath);
    await lockFile.parent.create(recursive: true);

    if (await lockFile.exists()) {
      final raw = await lockFile.readAsString();
      final prior = jsonDecode(raw) as Map<String, dynamic>;
      final pid = (prior['pid'] as num?)?.toInt();
      if (pid != null && await _isPidAlive(pid)) {
        final priorNodeId = prior['node_id'] ?? 'unknown';
        throw StateError(
            'another honeycomb instance is already running on this device (pid=$pid, node_id=$priorNodeId).');
      }
      await lockFile.delete();
    }

    await lockFile.writeAsString(jsonEncode({
      'pid': pid,
      'node_id': nodeId,
      'created_at': DateTime.now().toUtc().toIso8601String(),
    }));
    _deviceLockPath = lockPath;
  }

  Future<void> _releaseDeviceLock() async {
    final path = _deviceLockPath;
    if (path == null) return;
    final file = File(path);
    if (await file.exists()) {
      try {
        final raw = await file.readAsString();
        final payload = jsonDecode(raw) as Map<String, dynamic>;
        final lockPid = (payload['pid'] as num?)?.toInt();
        if (lockPid == null || lockPid == pid) {
          await file.delete();
        }
      } catch (_) {
        await file.delete();
      }
    }
    _deviceLockPath = null;
  }

  String _resolveDeviceLockPath() {
    final fromEnv = Platform.environment['HONEYCOMB_DEVICE_LOCK_PATH'];
    if (fromEnv != null && fromEnv.isNotEmpty) return fromEnv;
    final fromDefine =
        const String.fromEnvironment('HONEYCOMB_DEVICE_LOCK_PATH');
    if (fromDefine.isNotEmpty) return fromDefine;
    final home = Platform.environment['HOME'];
    if (home != null && home.isNotEmpty) {
      return '$home/.honeycomb/device.instance.lock';
    }
    return '.honeycomb/device.instance.lock';
  }

  bool _allowMultiInstance() {
    final explicitAllow =
        (Platform.environment['HONEYCOMB_ALLOW_MULTI_INSTANCE'] ?? '')
            .toLowerCase();
    if (explicitAllow == '1' ||
        explicitAllow == 'true' ||
        explicitAllow == 'yes') {
      return true;
    }
    final virt = _virtualizationType();
    return virt != null;
  }

  String? _virtualizationType() {
    final configured = _configuredVirtualizationType();
    if (configured != null) {
      final value = configured.toLowerCase();
      if (value != 'none' && value != 'baremetal') return value;
    }
    if (File('/.dockerenv').existsSync()) {
      return 'docker';
    }
    if (Platform.isLinux) {
      try {
        final cgroup = File('/proc/1/cgroup').readAsStringSync().toLowerCase();
        for (final marker in [
          'docker',
          'containerd',
          'kubepods',
          'podman',
          'lxc'
        ]) {
          if (cgroup.contains(marker)) return marker;
        }
      } catch (_) {
        // ignore
      }
    }
    return null;
  }

  String? _configuredVirtualizationType() {
    final envVirt = Platform.environment['HONEYCOMB_VIRTUALIZATION_TYPE'];
    if (envVirt != null && envVirt.trim().isNotEmpty) return envVirt.trim();
    final defineVirt =
        const String.fromEnvironment('HONEYCOMB_VIRTUALIZATION_TYPE');
    if (defineVirt.isNotEmpty) return defineVirt.trim();
    return null;
  }

  Future<bool> _isPidAlive(int targetPid) async {
    if (targetPid <= 0) return false;
    if (targetPid == pid) return true;
    if (Platform.isMacOS || Platform.isLinux) {
      final result = await Process.run('/bin/ps', ['-p', '$targetPid']);
      return result.exitCode == 0;
    }
    return false;
  }

  String? _resolveWorkspaceRoot() {
    final candidates = <String>{
      Directory.current.path,
      File(configPath).absolute.parent.path,
      File(Platform.resolvedExecutable).absolute.parent.path,
      File(Platform.executable).absolute.parent.path,
    };

    for (final base in candidates) {
      var dir = Directory(base).absolute;
      for (var i = 0; i < 10; i++) {
        final sdkManifest = File('${dir.path}/hive-sdk/Cargo.toml');
        if (sdkManifest.existsSync()) {
          return dir.path;
        }

        final parent = dir.parent;
        if (parent.path == dir.path) break;
        dir = parent;
      }
    }

    return null;
  }
}
