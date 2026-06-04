import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../comb/comb_models.dart';

enum ControlPlaneConnectionState {
  disconnected,
  connecting,
  connected,
  reconnecting,
}

abstract class ControlPlaneClient {
  Future<void> connect();
  Future<void> disconnect();
  Future<void> registerNode(NodeIdentity identity);
  Future<void> startHeartbeat(Stream<NodeMetrics> metrics);
  Future<void> sendRuntimeLog(String message, {Map<String, Object?>? context});
  Stream<ControlPlaneCommand> get commands;
  Stream<ControlPlaneConnectionState> get connectionStates;
}

class WebSocketControlPlaneClient implements ControlPlaneClient {
  WebSocketControlPlaneClient({required this.url, required this.authToken});

  final String url;
  final String authToken;

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _channelSubscription;
  StreamSubscription<NodeMetrics>? _heartbeatSubscription;

  final StreamController<ControlPlaneCommand> _commands =
      StreamController<ControlPlaneCommand>.broadcast();
  final StreamController<ControlPlaneConnectionState> _states =
      StreamController<ControlPlaneConnectionState>.broadcast();

  bool _disposed = false;
  bool _reconnectLoopRunning = false;
  int _retries = 0;
  bool _degradedHttpConnected = false;
  String? _registeredNodeId;

  @override
  Stream<ControlPlaneCommand> get commands => _commands.stream;

  @override
  Stream<ControlPlaneConnectionState> get connectionStates => _states.stream;

  @override
  Future<void> connect() async {
    if (_disposed || _channel != null) {
      return;
    }

    _states.add(ControlPlaneConnectionState.connecting);
    final connected = await _connectOnce();

    if (!connected) {
      final httpOk = await _probeHttpHealth();
      if (httpOk) {
        _degradedHttpConnected = true;
        _states.add(ControlPlaneConnectionState.connected);
        return;
      }
    }

    if (_channel == null && !_degradedHttpConnected) {
      _startReconnectLoop();
    }
  }

  Future<bool> _connectOnce() async {
    try {
      final uri = Uri.parse(url);
      final channel = WebSocketChannel.connect(uri);
      await channel.ready;
      _channel = channel;
      _degradedHttpConnected = false;
      _retries = 0;
      _states.add(ControlPlaneConnectionState.connected);

      _send({
        'type': 'auth',
        'token': authToken,
      });

      _channelSubscription = channel.stream.listen(
        (event) {
          if (event is! String) return;
          final data = jsonDecode(event) as Map<String, dynamic>;
          _commands.add(ControlPlaneCommand.fromJson(data));
        },
        onDone: _onSocketClosed,
        onError: (_) => _onSocketClosed(),
        cancelOnError: true,
      );
      return true;
    } catch (_) {
      _channel = null;
      return false;
    }
  }

  void _onSocketClosed() {
    _channelSubscription?.cancel();
    _channelSubscription = null;
    _channel = null;

    if (_disposed) return;

    if (_degradedHttpConnected) {
      _states.add(ControlPlaneConnectionState.connected);
      return;
    }

    _states.add(ControlPlaneConnectionState.reconnecting);
    _startReconnectLoop();
  }

  void _startReconnectLoop() {
    if (_reconnectLoopRunning || _disposed) return;
    _reconnectLoopRunning = true;
    unawaited(() async {
      while (!_disposed && _channel == null) {
        await _waitBeforeReconnect();
        if (_disposed || _channel != null) {
          break;
        }
        final connected = await _connectOnce();
        if (!connected) {
          final httpOk = await _probeHttpHealth();
          if (httpOk) {
            _degradedHttpConnected = true;
            _states.add(ControlPlaneConnectionState.connected);
            break;
          }
        }
      }
      _reconnectLoopRunning = false;
    }());
  }

  Future<void> _waitBeforeReconnect() async {
    _retries += 1;
    final clamped = _retries > 6 ? 6 : _retries;
    final wait = Duration(milliseconds: 250 * (1 << clamped));
    await Future<void>.delayed(wait);
  }

  @override
  Future<void> disconnect() async {
    _disposed = true;
    await _heartbeatSubscription?.cancel();
    await _channelSubscription?.cancel();
    await _channel?.sink.close();
    _heartbeatSubscription = null;
    _channelSubscription = null;
    _channel = null;
    _degradedHttpConnected = false;
    _states.add(ControlPlaneConnectionState.disconnected);
    await _commands.close();
    await _states.close();
  }

  @override
  Future<void> registerNode(NodeIdentity identity) async {
    _send({'type': 'register_node', 'payload': identity.toJson()});
    _registeredNodeId = identity.nodeId;
    await _registerNodeHttp(identity);
  }

  @override
  Future<void> startHeartbeat(Stream<NodeMetrics> metrics) async {
    await _heartbeatSubscription?.cancel();
    _heartbeatSubscription = metrics.listen((snapshot) {
      _send({'type': 'heartbeat', 'payload': snapshot.toJson()});
      final nodeId = _registeredNodeId;
      if (nodeId != null) {
        unawaited(_heartbeatHttp(nodeId, snapshot));
      }
    });
  }

  @override
  Future<void> sendRuntimeLog(String message,
      {Map<String, Object?>? context}) async {
    _send({
      'type': 'runtime_log',
      'payload': {
        'message': message,
        'timestamp': DateTime.now().toUtc().toIso8601String(),
        if (context != null) 'context': context,
      }
    });
  }

  void _send(Map<String, Object?> payload) {
    _channel?.sink.add(jsonEncode(payload));
  }

  Future<bool> _probeHttpHealth() async {
    final wsUri = Uri.tryParse(url);
    if (wsUri == null) return false;
    final scheme = wsUri.scheme == 'wss' ? 'https' : 'http';
    final uri = wsUri.replace(
      scheme: scheme,
      path: '/healthz',
      query: '',
      fragment: '',
    );

    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 3);
    try {
      final req = await client.getUrl(uri);
      final resp = await req.close();
      return resp.statusCode >= 200 && resp.statusCode < 300;
    } catch (_) {
      return false;
    } finally {
      client.close(force: true);
    }
  }

  Future<void> _registerNodeHttp(NodeIdentity identity) async {
    final uri = _resolveHttpUri('/api/nodes/register');
    if (uri == null) return;
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
    try {
      final req = await client.postUrl(uri);
      req.headers.set('x-api-key', authToken);
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({
        'node_id': identity.nodeId,
        'cpu_cores': identity.cpuCores ?? 1,
        'memory_mb': identity.memoryMb ?? 1024,
        'available_memory_mb': identity.memoryMb ?? 1024,
        'llm_profiles': identity.llmProfiles,
        'node_labels': identity.ownedHoneycomb ? ['owned'] : ['shared'],
        'docker': _runningInContainer(),
        'wasm': true,
        'node_api_base_url':
            Platform.environment['HONEYCOMB_NODE_API_BASE_URL'],
        if (identity.acceleratorTier != null)
          'accelerator_tier': identity.acceleratorTier,
        if (identity.ownerPolicy != null) 'owner_policy': identity.ownerPolicy,
        'node_metadata': {
          'platform_family': identity.platform,
          'architecture': identity.arch,
          'operating_system': identity.platform,
          if (identity.operatingSystemVersion != null)
            'operating_system_version': identity.operatingSystemVersion,
          if (identity.kernelVersion != null)
            'kernel_version': identity.kernelVersion,
          'device_name': identity.deviceName,
          if (identity.hostname != null) 'hostname': identity.hostname,
          if (identity.timezone != null) 'timezone': identity.timezone,
          if (identity.locationHint != null)
            'location_hint': identity.locationHint,
          if (identity.deviceType != null) 'device_type': identity.deviceType,
          'runtime_version': identity.runtimeVersion ?? 'honeycomb-dart',
          if (identity.agentVersion != null)
            'agent_version': identity.agentVersion,
          if (identity.virtualizationType != null)
            'virtualization_type': identity.virtualizationType,
          if (identity.gpuDevices.isNotEmpty)
            'gpu_devices': identity.gpuDevices,
          if (identity.acceleratorTier != null)
            'accelerator_tier': identity.acceleratorTier,
          if (identity.ownerPolicy != null)
            'owner_policy': identity.ownerPolicy,
        },
      }));
      final resp = await req.close();
      if (resp.statusCode < 200 || resp.statusCode >= 300) {
        final body = await utf8.decodeStream(resp);
        throw StateError(
            'node register failed (${resp.statusCode}) via HTTP: $body');
      }
    } finally {
      client.close(force: true);
    }
  }

  Future<void> _heartbeatHttp(String nodeId, NodeMetrics snapshot) async {
    final uri = _resolveHttpUri('/api/nodes/heartbeat');
    if (uri == null) return;
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
    try {
      final req = await client.postUrl(uri);
      req.headers.set('x-api-key', authToken);
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({
        'node_id': nodeId,
        'timestamp': snapshot.timestamp.toIso8601String(),
        'active_tasks': snapshot.activeAgents,
        'cpu_usage_percent': snapshot.cpuUsagePercent,
        'memory_usage_percent': snapshot.memoryUsagePercent,
        if (snapshot.batteryPercent != null)
          'battery_percent': snapshot.batteryPercent,
        if (snapshot.privateIp != null) 'private_ip': snapshot.privateIp,
        if (snapshot.publicIp != null) 'public_ip': snapshot.publicIp,
        if (snapshot.sensorReadings.isNotEmpty)
          'sensor_readings': snapshot.sensorReadings,
      }));
      final resp = await req.close();
      if (resp.statusCode < 200 || resp.statusCode >= 300) {
        await utf8.decodeStream(resp);
      }
    } finally {
      client.close(force: true);
    }
  }

  Uri? _resolveHttpUri(String path) {
    final wsUri = Uri.tryParse(url);
    if (wsUri == null) return null;
    final scheme = wsUri.scheme == 'wss' ? 'https' : 'http';
    return wsUri.replace(scheme: scheme, path: path, query: '', fragment: '');
  }

  bool _runningInContainer() {
    return File('/.dockerenv').existsSync();
  }
}

class ControlPlaneCommand {
  ControlPlaneCommand({required this.type, required this.payload});

  final String type;
  final Map<String, dynamic> payload;

  static ControlPlaneCommand fromJson(Map<String, dynamic> json) =>
      ControlPlaneCommand(
          type: json['type'] as String? ?? 'unknown', payload: json);
}
