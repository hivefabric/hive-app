import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:battery_plus/battery_plus.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_background/flutter_background.dart';
import 'package:honeycomb/honeycomb.dart';
import 'package:network_info_plus/network_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'owner_policy.dart';
import 'owner_policy_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const HoneycombApp());
}

class HoneycombApp extends StatefulWidget {
  const HoneycombApp({super.key});

  @override
  State<HoneycombApp> createState() => _HoneycombAppState();
}

class _HoneycombAppState extends State<HoneycombApp> {
  static const String _savedControlPlaneHostKey = 'control_plane_host';
  final WaxLocalStore _store = WaxLocalStore();
  HoneycombRuntime? _runtime;
  RuntimeState _state = RuntimeState.created;
  String? _bootError;
  bool _bootInProgress = false;
  String? _bootProgress;
  String? _resolvedControlPlaneWsUrl;
  String? _resolvedControlPlaneHttpUrl;
  String? _controlPlaneHostOverride;
  final TextEditingController _hostController = TextEditingController();
  final List<RuntimeEvent> _events = <RuntimeEvent>[];
  final List<Map<String, dynamic>> _nodeTasks = <Map<String, dynamic>>[];
  bool _submittingHelloTask = false;
  String? _helloTaskStatus;
  String? _helloTaskId;
  String? _helloTaskError;
  bool _loadingTasks = false;
  bool _autoRefreshTasks = true;
  String? _nodeId;
  String? _tasksError;
  Timer? _tasksTimer;
  _MobileTelemetryCollector? _mobileTelemetry;

  StreamSubscription<RuntimeState>? _stateSub;
  StreamSubscription<RuntimeEvent>? _eventSub;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    if (_bootInProgress) return;
    _bootInProgress = true;
    setState(() {
      _state = RuntimeState.starting;
      _bootError = null;
      _bootProgress = 'loading configuration';
    });
    final configPath = Platform.environment['HONEYCOMB_CONFIG_PATH'] ??
        (Platform.isAndroid || Platform.isIOS
            ? 'config/honeycomb.example.json'
            : '../../config/honeycomb.example.json');
    try {
      final persistedHost = await _loadPersistedControlPlaneHost();
      if (persistedHost != null && persistedHost.isNotEmpty) {
        _controlPlaneHostOverride = persistedHost;
        _hostController.text = persistedHost;
      }
      if (Platform.isAndroid) {
        setState(() => _bootProgress = 'enabling background runtime');
        await _enableAndroidBackgroundExecution();
      }
      final loadedConfig = await ConfigStore(defaultPath: configPath).load();
      final configWithStableId = await _ensureStableNodeId(loadedConfig);
      final config = await _resolveRuntimeConfig(configWithStableId);
      final nodeContext = await _buildNodeContext(config.nodeId);
      final runtime = await buildRuntime(
        config,
        configPath: configPath,
        identityHints: nodeContext?.identityHints,
        telemetryProvider: nodeContext?.telemetryProvider,
      );

      _stateSub = runtime.states.listen((next) {
        if (!mounted) return;
        setState(() => _state = next);
      });

      _eventSub = runtime.events.listen((event) {
        if (!mounted) return;
        setState(() {
          _events.insert(0, event);
          if (_events.length > 200) {
            _events.removeRange(200, _events.length);
          }
        });
      });

      if (!mounted) return;
      setState(() {
        _runtime = runtime;
        _state = runtime.state;
        _bootProgress = 'initializing runtime';
      });
      await runtime.initialize();
      if (mounted) {
        setState(() => _bootProgress = 'connecting to control plane');
      }
      await runtime.start();
      await _persistCurrentControlPlaneHost();
      if (mounted) {
        setState(() => _bootProgress = null);
      }
      unawaited(_refreshNodeTasks());
      _startTaskRefreshLoop();
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _state = RuntimeState.failed;
        _bootError = err.toString();
        _bootProgress = null;
      });
    } finally {
      _bootInProgress = false;
    }
  }

  Future<String?> _loadPersistedControlPlaneHost() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final value = prefs.getString(_savedControlPlaneHostKey);
      if (value == null || value.trim().isEmpty) return null;
      return value.trim();
    } catch (_) {
      return null;
    }
  }

  Future<void> _persistCurrentControlPlaneHost() async {
    try {
      String? host = _controlPlaneHostOverride;
      if (host == null || host.isEmpty) {
        final entered = _hostController.text.trim();
        if (entered.isNotEmpty) {
          host = entered;
        }
      }
      if ((host == null || host.isEmpty) &&
          _resolvedControlPlaneHttpUrl != null) {
        host = Uri.tryParse(_resolvedControlPlaneHttpUrl!)?.host;
      }
      if (host == null || host.isEmpty) return;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_savedControlPlaneHostKey, host);
    } catch (_) {
      // Best effort persistence.
    }
  }

  Future<void> _enableAndroidBackgroundExecution() async {
    if (!Platform.isAndroid) return;
    // H-17: contributor-facing transparent notification. Tap to pause/resume.
    final initialized = await FlutterBackground.initialize(
      androidConfig: const FlutterBackgroundAndroidConfig(
        notificationTitle: 'HiveFabric is contributing',
        notificationText: "You're in control. Tap to pause.",
        notificationImportance: AndroidNotificationImportance.normal,
        notificationIcon: AndroidResource(
          name: 'ic_launcher',
          defType: 'mipmap',
        ),
        enableWifiLock: true,
      ),
    );
    if (!initialized) {
      throw StateError('android background service could not be initialized');
    }
    // Best-effort POST_NOTIFICATIONS request (Android 13+). flutter_background
    // does this internally on enableBackgroundExecution(), but a dedicated
    // ping via the system intent guarantees the prompt fires on first launch.
    await _requestNotificationsPermission();
    final enabled = await FlutterBackground.enableBackgroundExecution();
    if (!enabled) {
      throw StateError('android background execution permission was denied');
    }
  }

  Future<void> _requestNotificationsPermission() async {
    if (!Platform.isAndroid) return;
    const channel = MethodChannel('flutter/permissions_helper');
    try {
      // Best-effort; if no platform handler is registered the call is a no-op.
      await channel.invokeMethod('requestNotificationPermission');
    } on MissingPluginException {
      // Falls through to flutter_background's internal request.
    } catch (_) {
      // Swallow — non-fatal.
    }
  }

  Future<_NodeRuntimeContext?> _buildNodeContext(String nodeId) async {
    if (!(Platform.isAndroid || Platform.isIOS)) return null;
    _mobileTelemetry ??= _MobileTelemetryCollector();
    final snapshot = await _mobileTelemetry!.collectInitialSnapshot(nodeId);
    final policy = await _store.loadPolicy();
    // Phase 1 default: every Android phone reports as "cpu" tier. Phase 3
    // will probe NNAPI / vendor SDKs to upgrade to "npu" / "edge-gpu".
    const acceleratorTier = 'cpu';
    final hints = NodeIdentityHints(
      deviceName: snapshot.identityHints.deviceName,
      platform: snapshot.identityHints.platform,
      architecture: snapshot.identityHints.architecture,
      cpuCores: snapshot.identityHints.cpuCores,
      memoryMb: snapshot.identityHints.memoryMb,
      llmProfiles: snapshot.identityHints.llmProfiles,
      operatingSystemVersion: snapshot.identityHints.operatingSystemVersion,
      kernelVersion: snapshot.identityHints.kernelVersion,
      hostname: snapshot.identityHints.hostname,
      timezone: snapshot.identityHints.timezone,
      locationHint: snapshot.identityHints.locationHint,
      deviceType: snapshot.identityHints.deviceType,
      runtimeVersion: snapshot.identityHints.runtimeVersion,
      agentVersion: snapshot.identityHints.agentVersion,
      virtualizationType: snapshot.identityHints.virtualizationType,
      gpuDevices: snapshot.identityHints.gpuDevices,
      acceleratorTier: acceleratorTier,
      ownerPolicy: policy.toJson(),
    );
    return _NodeRuntimeContext(
      identityHints: hints,
      telemetryProvider: _mobileTelemetry!.collectTelemetryExtras,
    );
  }

  /// On mobile, persist a UUIDv4 in shared_preferences so the comb re-registers
  /// as itself across app restarts. If the user has set an explicit
  /// HONEYCOMB_NODE_ID via env or dart-define (config.nodeId differs from
  /// 'honeycomb-node' default), respect it and persist that.
  Future<HoneycombConfig> _ensureStableNodeId(HoneycombConfig config) async {
    if (!(Platform.isAndroid || Platform.isIOS)) return config;
    final defaultId =
        config.nodeId == 'honeycomb-node' || config.nodeId.isEmpty;
    String resolved;
    if (defaultId) {
      resolved = await _store.getOrCreateNodeId();
    } else {
      // Explicit override: persist for next launch.
      resolved = config.nodeId;
      await _store.setNodeId(resolved);
    }
    return HoneycombConfig(
      nodeId: resolved,
      mode: config.mode,
      controlPlaneUrl: config.controlPlaneUrl,
      controlPlaneHttpUrl: config.controlPlaneHttpUrl,
      authToken: config.authToken,
      ownedHoneycomb: config.ownedHoneycomb,
      autoStartAgents: config.autoStartAgents,
      sdkCommand: config.sdkCommand,
      sdkLibraryPath: config.sdkLibraryPath,
    );
  }

  Future<void> _retryBoot() async {
    if (_bootInProgress) return;
    final runtime = _runtime;
    _runtime = null;
    await _stateSub?.cancel();
    await _eventSub?.cancel();
    _stateSub = null;
    _eventSub = null;
    _tasksTimer?.cancel();
    _tasksTimer = null;
    if (runtime != null) {
      await runtime.shutdown();
    }
    if (!mounted) return;
    setState(() {
      _state = RuntimeState.created;
      _bootError = null;
      _bootProgress = null;
      _nodeId = null;
      _nodeTasks.clear();
      final host = _hostController.text.trim();
      _controlPlaneHostOverride = host.isEmpty ? null : host;
    });
    await _boot();
  }

  @override
  void dispose() {
    _tasksTimer?.cancel();
    unawaited(_stateSub?.cancel());
    unawaited(_eventSub?.cancel());
    final runtime = _runtime;
    if (runtime != null) {
      unawaited(runtime.shutdown());
    }
    _hostController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isReady = _runtime != null && _state == RuntimeState.running;
    return MaterialApp(
      title: 'Honeycomb',
      home: !isReady
          ? _buildConnectingScreen()
          : Scaffold(
              appBar: AppBar(
                title: const Text('Honeycomb Runtime'),
                actions: [
                  IconButton(
                    tooltip: 'Owner policy',
                    icon: const Icon(Icons.shield_outlined),
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => OwnerPolicyScreen(store: _store),
                      ),
                    ),
                  ),
                ],
              ),
              body: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Runtime state: ${_state.name}',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        ElevatedButton(
                          onPressed:
                              _submittingHelloTask ? null : _submitHelloTask,
                          child: Text(
                            _submittingHelloTask
                                ? 'Running...'
                                : 'Run Hello Task',
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: _loadingTasks ? null : _refreshNodeTasks,
                          child: Text(
                            _loadingTasks ? 'Refreshing...' : 'Refresh Tasks',
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _helloTaskStatus == null
                                ? 'No task submitted yet'
                                : 'Task ${_helloTaskId ?? "-"}: $_helloTaskStatus',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Switch(
                          value: _autoRefreshTasks,
                          onChanged: (value) {
                            setState(() => _autoRefreshTasks = value);
                            _startTaskRefreshLoop();
                          },
                        ),
                        const Text('Auto refresh tasks'),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _nodeId == null
                                ? 'Node: unresolved'
                                : 'Node: $_nodeId',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    if (_helloTaskError != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        _helloTaskError!,
                        style: const TextStyle(color: Colors.red),
                      ),
                    ],
                    if (_tasksError != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        _tasksError!,
                        style: const TextStyle(color: Colors.red),
                      ),
                    ],
                    const SizedBox(height: 16),
                    Expanded(
                      child: Row(
                        children: [
                          Expanded(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                border: Border.all(color: Colors.grey.shade300),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Padding(
                                    padding: EdgeInsets.all(12),
                                    child: Text(
                                      'Tasks on this node',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  const Divider(height: 1),
                                  Expanded(
                                    child: _nodeTasks.isEmpty
                                        ? const Center(
                                            child: Text('No tasks yet'),
                                          )
                                        : ListView.builder(
                                            itemCount: _nodeTasks.length,
                                            itemBuilder: (context, index) {
                                              final task = _nodeTasks[index];
                                              final taskId = (task['task_id']
                                                      as String?) ??
                                                  '-';
                                              final status =
                                                  (task['status'] as String?) ??
                                                      'unknown';
                                              return ListTile(
                                                dense: true,
                                                title: Text(taskId),
                                                subtitle: Text(
                                                  'status: $status  •  updated: ${task['updated_at'] ?? '-'}',
                                                ),
                                                trailing: const Icon(
                                                  Icons.chevron_right,
                                                ),
                                                onTap: () =>
                                                    Navigator.of(context).push(
                                                  MaterialPageRoute(
                                                    builder: (_) =>
                                                        TaskDetailsPage(
                                                      task: task,
                                                    ),
                                                  ),
                                                ),
                                              );
                                            },
                                          ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                border: Border.all(color: Colors.grey.shade300),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Padding(
                                    padding: EdgeInsets.all(12),
                                    child: Text(
                                      'Runtime events',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  const Divider(height: 1),
                                  Expanded(
                                    child: ListView.builder(
                                      itemCount: _events.length,
                                      itemBuilder: (context, index) {
                                        final e = _events[index];
                                        return ListTile(
                                          dense: true,
                                          title: Text(e.message),
                                          subtitle: Text(
                                            '${e.kind} · ${e.timestamp.toIso8601String()}',
                                          ),
                                        );
                                      },
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildConnectingScreen() {
    final status = switch (_state) {
      RuntimeState.failed => 'failed',
      RuntimeState.waitingForConnection =>
        'waiting for control plane connection',
      RuntimeState.initializing => 'initializing runtime',
      RuntimeState.initialized => 'runtime initialized',
      RuntimeState.starting => 'starting runtime',
      _ => 'starting',
    };
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_state != RuntimeState.failed)
                const CircularProgressIndicator(),
              const SizedBox(height: 16),
              Text(
                _state == RuntimeState.failed
                    ? 'Honeycomb failed to start'
                    : 'Connecting Honeycomb',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text('Status: $status'),
              if (_bootProgress != null) ...[
                const SizedBox(height: 6),
                Text('Progress: $_bootProgress'),
              ],
              if (_resolvedControlPlaneHttpUrl != null) ...[
                const SizedBox(height: 6),
                Text(
                  'HTTP: $_resolvedControlPlaneHttpUrl',
                  textAlign: TextAlign.center,
                ),
              ],
              if (_resolvedControlPlaneWsUrl != null) ...[
                const SizedBox(height: 4),
                Text(
                  'WS: $_resolvedControlPlaneWsUrl',
                  textAlign: TextAlign.center,
                ),
              ],
              if (_bootError != null) ...[
                const SizedBox(height: 12),
                Text(
                  _bootError!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.red),
                ),
              ],
              const SizedBox(height: 12),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 360),
                child: TextField(
                  controller: _hostController,
                  keyboardType: TextInputType.url,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    labelText: 'Control Plane Host/IP (optional)',
                    hintText: 'e.g. 192.168.1.120',
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ElevatedButton(
                    onPressed:
                        _bootInProgress ? null : () => unawaited(_retryBoot()),
                    child: Text(
                      _state == RuntimeState.failed ? 'Retry' : 'Reconnect',
                    ),
                  ),
                  const SizedBox(width: 12),
                  OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => OwnerPolicyScreen(store: _store),
                      ),
                    ),
                    icon: const Icon(Icons.shield_outlined),
                    label: const Text('Policy'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _startTaskRefreshLoop() {
    _tasksTimer?.cancel();
    if (!_autoRefreshTasks) return;
    _tasksTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      unawaited(_refreshNodeTasks());
    });
  }

  Future<void> _refreshNodeTasks() async {
    if (_loadingTasks) return;
    setState(() {
      _loadingTasks = true;
      _tasksError = null;
    });
    try {
      final base = _resolvedControlPlaneHttpUrl ??
          _env(
            key: 'HONEYCOMB_CONTROL_PLANE_HTTP_URL',
            fallback: 'http://localhost:8080',
          );
      final apiKey = _env(
        key: 'HONEYCOMB_AUTH_TOKEN',
        fallback: 'dev-hive-key',
      );
      final expectedApiBase = _env(
        key: 'HONEYCOMB_NODE_API_BASE_URL',
        fallback: 'http://host.docker.internal:7070',
      );

      final client = HttpClient();
      final nodesReq = await client.getUrl(Uri.parse('$base/api/nodes'));
      nodesReq.headers.set('x-api-key', apiKey);
      final nodesResp = await nodesReq.close();
      final nodesBody = await utf8.decodeStream(nodesResp);
      if (nodesResp.statusCode < 200 || nodesResp.statusCode >= 300) {
        throw StateError(
          'nodes request failed (${nodesResp.statusCode}): $nodesBody',
        );
      }
      final nodes = (jsonDecode(nodesBody) as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .toList(growable: false);
      final node = nodes.firstWhere(
        (n) => (n['node_api_base_url'] as String?) == expectedApiBase,
        orElse: () => nodes.isNotEmpty ? nodes.first : <String, dynamic>{},
      );
      final resolvedNodeId = node.isEmpty ? null : (node['node_id'] as String?);

      final tasksReq = await client.getUrl(Uri.parse('$base/api/tasks'));
      tasksReq.headers.set('x-api-key', apiKey);
      final tasksResp = await tasksReq.close();
      final tasksBody = await utf8.decodeStream(tasksResp);
      if (tasksResp.statusCode < 200 || tasksResp.statusCode >= 300) {
        throw StateError(
          'tasks request failed (${tasksResp.statusCode}): $tasksBody',
        );
      }
      final tasks = (jsonDecode(tasksBody) as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .toList(growable: false);

      final filtered = resolvedNodeId == null
          ? <Map<String, dynamic>>[]
          : tasks.where((task) {
              final assigned = task['assigned_node_id'] as String?;
              if (assigned == resolvedNodeId) return true;
              final logs = task['logs'];
              if (logs is List) {
                return logs.any(
                  (entry) =>
                      entry is String &&
                      entry.contains(
                        'task assigned to node $resolvedNodeId',
                      ),
                );
              }
              return false;
            }).toList(growable: false);

      filtered.sort((a, b) {
        final aTs = DateTime.tryParse((a['updated_at'] as String?) ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0);
        final bTs = DateTime.tryParse((b['updated_at'] as String?) ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0);
        return bTs.compareTo(aTs);
      });

      if (!mounted) return;
      setState(() {
        _nodeId = resolvedNodeId;
        _nodeTasks
          ..clear()
          ..addAll(filtered);
      });
    } catch (err) {
      if (!mounted) return;
      setState(() => _tasksError = err.toString());
    } finally {
      if (mounted) {
        setState(() => _loadingTasks = false);
      }
    }
  }

  Future<void> _submitHelloTask() async {
    setState(() {
      _submittingHelloTask = true;
      _helloTaskError = null;
      _helloTaskStatus = 'submitting';
    });

    try {
      final controlPlaneBase = _resolvedControlPlaneHttpUrl ??
          _env(
            key: 'HONEYCOMB_CONTROL_PLANE_HTTP_URL',
            fallback: 'http://localhost:8080',
          );
      final apiKey = _env(
        key: 'HONEYCOMB_AUTH_TOKEN',
        fallback: 'dev-hive-key',
      );
      final taskId = _uuidV4();

      final payload = {
        'task_id': taskId,
        'owner_id': '00000000-0000-0000-0000-000000000000',
        'execution_type': 'wasm',
        'payload': {
          // Precompiled tiny WASM module (run -> i32.const 0) encoded as base64.
          // This avoids WAT compilation on constrained mobile devices.
          'module_source': 'AGFzbQEAAAABBQFgAAF/AwIBAAcHAQNydW4AAAoGAQQAQQAL',
          'module_format': 'wasm-base64',
          'input': {
            'task': 'sunrise_sunset_today',
            'web_request': {
              'url':
                  'https://api.sunrise-sunset.org/json?lat=40.4168&lng=-3.7038&formatted=0',
            },
          },
        },
        'required_capabilities': {
          'cpu_cores': 1,
          'memory_mb': 64,
          'llm_profiles': <String>[],
        },
        'allowed_nodes': 'hive-wide',
      };

      final client = HttpClient();
      final createReq = await client.postUrl(
        Uri.parse('$controlPlaneBase/api/tasks/create'),
      );
      createReq.headers.contentType = ContentType.json;
      createReq.headers.set('x-api-key', apiKey);
      createReq.write(jsonEncode(payload));
      final createResp = await createReq.close();
      final createBody = await utf8.decodeStream(createResp);
      if (createResp.statusCode < 200 || createResp.statusCode >= 300) {
        throw StateError(
          'task create failed (${createResp.statusCode}): $createBody',
        );
      }

      setState(() {
        _helloTaskId = taskId;
        _helloTaskStatus = 'submitted';
      });

      final status = await _pollTaskStatus(
        client: client,
        baseUrl: controlPlaneBase,
        apiKey: apiKey,
        taskId: taskId,
      );
      setState(() => _helloTaskStatus = status);
      if (status == 'succeeded' ||
          status == 'failed' ||
          status == 'timed_out') {
        final task = await _fetchTaskById(
          client: client,
          baseUrl: controlPlaneBase,
          apiKey: apiKey,
          taskId: taskId,
        );
        if (task != null && mounted) {
          _notifyTaskOutcome(task);
        }
      }
      await _refreshNodeTasks();
    } catch (err) {
      setState(() {
        _helloTaskStatus = 'failed';
        _helloTaskError = err.toString();
      });
    } finally {
      setState(() => _submittingHelloTask = false);
    }
  }

  Future<String> _pollTaskStatus({
    required HttpClient client,
    required String baseUrl,
    required String apiKey,
    required String taskId,
  }) async {
    for (var i = 0; i < 30; i++) {
      await Future<void>.delayed(const Duration(seconds: 1));
      final req = await client.getUrl(Uri.parse('$baseUrl/api/tasks'));
      req.headers.set('x-api-key', apiKey);
      final resp = await req.close();
      final body = await utf8.decodeStream(resp);
      if (resp.statusCode < 200 || resp.statusCode >= 300) {
        continue;
      }
      final list = jsonDecode(body) as List<dynamic>;
      Map<String, dynamic>? row;
      for (final item in list) {
        if (item is! Map<String, dynamic>) continue;
        if (item['task_id'] == taskId) {
          row = item;
          break;
        }
      }
      if (row == null) continue;
      final status = (row['status'] as String?) ?? 'unknown';
      if (status == 'succeeded' ||
          status == 'failed' ||
          status == 'timed_out') {
        return status;
      }
      if (mounted) {
        setState(() => _helloTaskStatus = status);
      }
    }
    return 'pending';
  }

  Future<Map<String, dynamic>?> _fetchTaskById({
    required HttpClient client,
    required String baseUrl,
    required String apiKey,
    required String taskId,
  }) async {
    final req = await client.getUrl(Uri.parse('$baseUrl/api/tasks'));
    req.headers.set('x-api-key', apiKey);
    final resp = await req.close();
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      return null;
    }
    final body = await utf8.decodeStream(resp);
    final list = jsonDecode(body) as List<dynamic>;
    for (final item in list) {
      if (item is! Map<String, dynamic>) continue;
      if (item['task_id'] == taskId) {
        return item;
      }
    }
    return null;
  }

  void _notifyTaskOutcome(Map<String, dynamic> task) {
    final status = (task['status'] as String?) ?? 'unknown';
    final output = task['output'];
    String message = 'Task ${task['task_id']} $status';
    if (output is Map<String, dynamic>) {
      final web = output['web_result'];
      if (web is Map<String, dynamic>) {
        final sunrise = web['sunrise'] ?? '-';
        final sunset = web['sunset'] ?? '-';
        message = 'Sunrise: $sunrise | Sunset: $sunset';
      }
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), duration: const Duration(seconds: 8)),
    );
  }

  String _uuidV4() {
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

  String _env({required String key, required String fallback}) {
    final runtime = Platform.environment[key];
    if (runtime != null && runtime.isNotEmpty) {
      return runtime;
    }
    final compileTime = switch (key) {
      'HONEYCOMB_CONTROL_PLANE_HTTP_URL' => const String.fromEnvironment(
          'HONEYCOMB_CONTROL_PLANE_HTTP_URL',
        ),
      'HONEYCOMB_AUTH_TOKEN' => const String.fromEnvironment(
          'HONEYCOMB_AUTH_TOKEN',
        ),
      'HONEYCOMB_DEMO_WASM_PATH' => const String.fromEnvironment(
          'HONEYCOMB_DEMO_WASM_PATH',
        ),
      'HONEYCOMB_NODE_API_BASE_URL' => const String.fromEnvironment(
          'HONEYCOMB_NODE_API_BASE_URL',
        ),
      _ => '',
    };
    return compileTime.isNotEmpty ? compileTime : fallback;
  }

  Future<HoneycombConfig> _resolveRuntimeConfig(HoneycombConfig config) async {
    String? overrideHost = _controlPlaneHostOverride;
    if (overrideHost == null || overrideHost.isEmpty) {
      final inputHost = _hostController.text.trim();
      if (inputHost.isNotEmpty) {
        overrideHost = inputHost;
      }
    }

    // In mobile dev, localhost defaults are not reachable from phone.
    if ((Platform.isAndroid || Platform.isIOS) &&
        (overrideHost == null || overrideHost.isEmpty)) {
      final wsUri = Uri.tryParse(config.controlPlaneUrl);
      final host = wsUri?.host;
      if (_isLoopbackHost(host) && _isDevDiscoveryEnabled()) {
        if (mounted) {
          setState(
            () => _bootProgress = 'scanning local network for control plane',
          );
        }
        final httpUri = Uri.tryParse(config.controlPlaneHttpUrl);
        final port =
            httpUri?.port == null || httpUri!.port == 0 ? 8080 : httpUri.port;
        final discovered = await _discoverControlPlaneHost(port: port);
        if (discovered != null && discovered.isNotEmpty) {
          overrideHost = discovered;
          _hostController.text = discovered;
        }
      }
    }

    final resolvedWs = _replaceHost(config.controlPlaneUrl, overrideHost);
    final resolvedHttp = _replaceHost(config.controlPlaneHttpUrl, overrideHost);
    final resolvedAuthToken = config.authToken.isNotEmpty
        ? config.authToken
        : _env(key: 'HONEYCOMB_AUTH_TOKEN', fallback: 'dev-hive-key');

    _resolvedControlPlaneWsUrl = resolvedWs;
    _resolvedControlPlaneHttpUrl = resolvedHttp;

    return HoneycombConfig(
      nodeId: config.nodeId,
      mode: config.mode,
      controlPlaneUrl: resolvedWs,
      controlPlaneHttpUrl: resolvedHttp,
      authToken: resolvedAuthToken,
      ownedHoneycomb: config.ownedHoneycomb,
      autoStartAgents: config.autoStartAgents,
      sdkCommand: config.sdkCommand,
      sdkLibraryPath: config.sdkLibraryPath,
    );
  }

  bool _isDevDiscoveryEnabled() {
    final fromEnv =
        Platform.environment['HONEYCOMB_DEV_SCAN_LOCAL_NETWORK']?.toLowerCase();
    if (fromEnv == '0' || fromEnv == 'false' || fromEnv == 'no') return false;
    if (fromEnv == '1' || fromEnv == 'true' || fromEnv == 'yes') return true;
    final fromDefine = const String.fromEnvironment(
      'HONEYCOMB_DEV_SCAN_LOCAL_NETWORK',
    ).toLowerCase();
    if (fromDefine == '0' || fromDefine == 'false' || fromDefine == 'no') {
      return false;
    }
    if (fromDefine == '1' || fromDefine == 'true' || fromDefine == 'yes') {
      return true;
    }
    return kDebugMode;
  }

  bool _isLoopbackHost(String? host) {
    if (host == null || host.isEmpty) return true;
    final normalized = host.toLowerCase();
    return normalized == 'localhost' ||
        normalized == '127.0.0.1' ||
        normalized == '::1';
  }

  String _replaceHost(String url, String? hostOverride) {
    if (hostOverride == null || hostOverride.isEmpty) return url;
    final uri = Uri.tryParse(url);
    if (uri == null) return url;
    return uri.replace(host: hostOverride).toString();
  }

  Future<String?> _discoverControlPlaneHost({required int port}) async {
    final candidates = <String>{};
    try {
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLoopback: false,
        includeLinkLocal: false,
      );
      InternetAddress? privateIp;
      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          if (_isPrivateIPv4(addr.address)) {
            privateIp = addr;
            break;
          }
        }
        if (privateIp != null) break;
      }
      if (privateIp == null) return null;
      final octets = privateIp.address.split('.');
      if (octets.length != 4) return null;
      final prefix = '${octets[0]}.${octets[1]}.${octets[2]}';
      final ownLast = int.tryParse(octets[3]) ?? 0;

      for (final n in <int>[1, 2, 10, ownLast - 1, ownLast + 1, 100, 200]) {
        if (n > 0 && n < 255) candidates.add('$prefix.$n');
      }
      for (var n = 1; n < 255; n++) {
        if (n == ownLast) continue;
        candidates.add('$prefix.$n');
      }
    } catch (_) {
      return null;
    }

    const batchSize = 24;
    final ordered = candidates.toList(growable: false);
    for (var i = 0; i < ordered.length; i += batchSize) {
      final batch = ordered.sublist(
        i,
        i + batchSize > ordered.length ? ordered.length : i + batchSize,
      );
      final results = await Future.wait(
        batch.map((host) async {
          final ok = await _probeHealth(host, port);
          return ok ? host : null;
        }),
      );
      for (final host in results) {
        if (host != null) {
          return host;
        }
      }
    }
    return null;
  }

  bool _isPrivateIPv4(String ip) {
    final parts = ip.split('.');
    if (parts.length != 4) return false;
    final a = int.tryParse(parts[0]) ?? -1;
    final b = int.tryParse(parts[1]) ?? -1;
    if (a == 10) return true;
    if (a == 172 && b >= 16 && b <= 31) return true;
    if (a == 192 && b == 168) return true;
    return false;
  }

  Future<bool> _probeHealth(String host, int port) async {
    final client = HttpClient()
      ..connectionTimeout = const Duration(milliseconds: 350);
    try {
      final req = await client.getUrl(Uri.parse('http://$host:$port/healthz'));
      final resp = await req.close().timeout(const Duration(milliseconds: 450));
      if (resp.statusCode < 200 || resp.statusCode >= 300) return false;
      final body = await utf8.decodeStream(resp);
      return body.contains('"ok":true');
    } catch (_) {
      return false;
    } finally {
      client.close(force: true);
    }
  }
}

class TaskDetailsPage extends StatelessWidget {
  const TaskDetailsPage({super.key, required this.task});

  final Map<String, dynamic> task;

  @override
  Widget build(BuildContext context) {
    final taskId = (task['task_id'] as String?) ?? '-';
    final logs =
        (task['logs'] is List) ? (task['logs'] as List<dynamic>) : const [];
    final lifecycle = (task['lifecycle'] is List)
        ? (task['lifecycle'] as List<dynamic>)
        : const [];
    return Scaffold(
      appBar: AppBar(title: Text('Task $taskId')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _kv('Status', '${task['status'] ?? '-'}'),
          _kv('Execution type', '${task['execution_type'] ?? '-'}'),
          _kv('Assigned node', '${task['assigned_node_id'] ?? '-'}'),
          _kv('Created at', '${task['created_at'] ?? '-'}'),
          _kv('Queued at', '${task['queued_at'] ?? '-'}'),
          _kv('Scheduled at', '${task['scheduled_at'] ?? '-'}'),
          _kv('Started at', '${task['started_at'] ?? '-'}'),
          _kv('Completed at', '${task['completed_at'] ?? '-'}'),
          _kv('Queue time (ms)', '${task['queue_time_ms'] ?? '-'}'),
          _kv('Execution time (ms)', '${task['execution_time_ms'] ?? '-'}'),
          _kv(
            'Retries',
            '${task['retries'] ?? '-'} / ${task['max_retries'] ?? '-'}',
          ),
          _kv('Last error', '${task['last_error'] ?? '-'}'),
          const SizedBox(height: 16),
          const Text('Input', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          SelectableText(
            const JsonEncoder.withIndent('  ').convert(task['input']),
          ),
          const SizedBox(height: 16),
          const Text('Output', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          SelectableText(
            const JsonEncoder.withIndent('  ').convert(task['output']),
          ),
          const SizedBox(height: 16),
          const Text(
            'Lifecycle',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          ...lifecycle.map((entry) {
            if (entry is! Map) return const SizedBox.shrink();
            return ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text('${entry['state'] ?? '-'}'),
              subtitle: Text(
                '${entry['at'] ?? '-'}\n${entry['message'] ?? ''}',
              ),
            );
          }),
          const SizedBox(height: 16),
          const Text('Logs', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          ...logs.map(
            (line) => ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text('$line'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _kv(String key, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 150,
            child: Text(
              key,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}

class _NodeRuntimeContext {
  const _NodeRuntimeContext({
    required this.identityHints,
    required this.telemetryProvider,
  });

  final NodeIdentityHints identityHints;
  final Future<NodeTelemetryExtras> Function() telemetryProvider;
}

class _MobileNodeSnapshot {
  const _MobileNodeSnapshot({
    required this.identityHints,
    required this.privateIp,
  });

  final NodeIdentityHints identityHints;
  final String? privateIp;
}

class _MobileTelemetryCollector {
  final Battery _battery = Battery();
  final DeviceInfoPlugin _deviceInfo = DeviceInfoPlugin();
  final NetworkInfo _networkInfo = NetworkInfo();
  String? _privateIp;

  Future<_MobileNodeSnapshot> collectInitialSnapshot(String nodeId) async {
    final locale = Platform.localeName;
    final timezone = DateTime.now().timeZoneName;
    final privateIp = await _networkInfo.getWifiIP();
    _privateIp = privateIp;

    if (Platform.isAndroid) {
      final info = await _deviceInfo.androidInfo;
      final gpuDevices = <String>{
        if (info.hardware.isNotEmpty) info.hardware,
        if (info.board.isNotEmpty) info.board,
        if (info.product.isNotEmpty) info.product,
      }.toList(growable: false);

      final hints = NodeIdentityHints(
        deviceName: info.model.isNotEmpty ? info.model : nodeId,
        platform: 'android',
        architecture:
            info.supportedAbis.isNotEmpty ? info.supportedAbis.first : null,
        cpuCores: Platform.numberOfProcessors,
        memoryMb: await _estimateAndroidMemoryMb(),
        llmProfiles: null,
        operatingSystemVersion: info.version.release,
        kernelVersion: info.version.incremental,
        hostname: info.host,
        timezone: timezone,
        locationHint: locale,
        deviceType: 'mobile',
        runtimeVersion: 'honeycomb-flutter',
        virtualizationType: 'none',
        gpuDevices: gpuDevices,
      );

      return _MobileNodeSnapshot(identityHints: hints, privateIp: privateIp);
    }

    if (Platform.isIOS) {
      final info = await _deviceInfo.iosInfo;
      final hints = NodeIdentityHints(
        deviceName: info.name,
        platform: 'ios',
        architecture: info.utsname.machine,
        cpuCores: Platform.numberOfProcessors,
        memoryMb: null,
        operatingSystemVersion: info.systemVersion,
        kernelVersion: info.utsname.version,
        hostname: info.utsname.nodename,
        timezone: timezone,
        locationHint: locale,
        deviceType: 'mobile',
        runtimeVersion: 'honeycomb-flutter',
        virtualizationType: 'none',
      );
      return _MobileNodeSnapshot(identityHints: hints, privateIp: privateIp);
    }

    return _MobileNodeSnapshot(
      identityHints: const NodeIdentityHints(),
      privateIp: privateIp,
    );
  }

  Future<NodeTelemetryExtras> collectTelemetryExtras() async {
    final batteryLevel = await _readBatteryLevel();
    final privateIp = _privateIp ?? await _networkInfo.getWifiIP();
    _privateIp = privateIp;

    final sensors = await _readSensorFlags();
    return NodeTelemetryExtras(
      batteryPercent: batteryLevel,
      privateIp: privateIp,
      publicIp: null,
      sensorReadings: sensors,
    );
  }

  Future<double?> _readBatteryLevel() async {
    try {
      final level = await _battery.batteryLevel;
      if (level < 0 || level > 100) return null;
      return level.toDouble();
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, double>> _readSensorFlags() async {
    try {
      if (Platform.isAndroid) {
        final info = await _deviceInfo.androidInfo;
        final features =
            info.systemFeatures.map((f) => f.toLowerCase()).toList();
        return <String, double>{
          'sensor.accelerometer':
              features.any((f) => f.contains('sensor.accelerometer')) ? 1 : 0,
          'sensor.gyroscope':
              features.any((f) => f.contains('sensor.gyroscope')) ? 1 : 0,
          'sensor.compass':
              features.any((f) => f.contains('sensor.compass')) ? 1 : 0,
          'sensor.barometer':
              features.any((f) => f.contains('sensor.barometer')) ? 1 : 0,
          'sensor.stepcounter':
              features.any((f) => f.contains('sensor.stepcounter')) ? 1 : 0,
        };
      }
    } catch (_) {
      // ignore
    }
    return const <String, double>{};
  }

  Future<int?> _estimateAndroidMemoryMb() async {
    if (!Platform.isAndroid) return null;
    try {
      final memInfo = await File('/proc/meminfo').readAsString();
      for (final line in memInfo.split('\n')) {
        if (!line.startsWith('MemTotal:')) continue;
        final parts = line.split(RegExp(r'\s+'));
        if (parts.length < 2) continue;
        final kb = int.tryParse(parts[1]) ?? 0;
        if (kb <= 0) continue;
        final mb = kb ~/ 1024;
        return mb > 0 ? mb : null;
      }
    } catch (_) {
      // ignore
    }
    return null;
  }
}
