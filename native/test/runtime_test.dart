import 'dart:async';

import 'package:honeycomb/core/agents/agent_manager.dart';
import 'package:honeycomb/core/agents/agent_model.dart';
import 'package:honeycomb/core/comb/comb_models.dart';
import 'package:honeycomb/core/comb/comb_node_manager.dart';
import 'package:honeycomb/core/control_plane/control_plane_client.dart';
import 'package:honeycomb/core/runtime/honeycomb_runtime.dart';
import 'package:honeycomb/infrastructure/background/hive_node_bridge.dart';
import 'package:test/test.dart';

class _FakeRepository implements AgentRepository {
  @override
  Future<void> initialize() async {}

  @override
  Future<List<AgentRuntime>> loadDesiredAgents() async => const [];

  @override
  Future<void> persistRuntime(AgentRuntime runtime) async {}
}

class _FakeControlPlaneClient implements ControlPlaneClient {
  bool connected = false;
  bool heartbeatsStarted = false;
  bool registered = false;

  final StreamController<ControlPlaneCommand> _commands =
      StreamController<ControlPlaneCommand>.broadcast();
  final StreamController<ControlPlaneConnectionState> _states =
      StreamController<ControlPlaneConnectionState>.broadcast();

  @override
  Stream<ControlPlaneCommand> get commands => _commands.stream;

  @override
  Stream<ControlPlaneConnectionState> get connectionStates => _states.stream;

  @override
  Future<void> connect() async {
    connected = true;
    _states.add(ControlPlaneConnectionState.connected);
  }

  @override
  Future<void> disconnect() async {
    connected = false;
    _states.add(ControlPlaneConnectionState.disconnected);
    await _commands.close();
    await _states.close();
  }

  @override
  Future<void> registerNode(NodeIdentity identity) async {
    registered = true;
  }

  @override
  Future<void> sendRuntimeLog(
    String message, {
    Map<String, Object?>? context,
  }) async {}

  @override
  Future<void> startHeartbeat(Stream<NodeMetrics> metrics) async {
    heartbeatsStarted = true;
  }
}

class _NoopBridge extends HiveNodeBridge {
  _NoopBridge()
      : super(
          configPath: '/tmp/unused-config.json',
          controlPlaneHttpUrl: 'http://localhost:8080',
          authToken: 'dev-hive-key',
          nodeId: 'test-node',
        );

  @override
  Future<void> startNode() async {}

  @override
  Future<void> stopNode() async {}
}

void main() {
  test('runtime transitions from created to running then stopped', () async {
    final cp = _FakeControlPlaneClient();
    final manager = CombNodeManager(
      bridge: _NoopBridge(),
      nodeIdentity: NodeIdentity(
        nodeId: 'node-1',
        deviceName: 'node-1',
        platform: 'linux',
        arch: 'x86_64',
        ownedHoneycomb: true,
      ),
    );

    final runtime = DefaultHoneycombRuntime(
      combNodeManager: manager,
      controlPlaneClient: cp,
      agentManager: AgentManager(repository: _FakeRepository()),
    );

    await runtime.initialize();
    expect(runtime.state.name, equals('initialized'));

    await runtime.start();
    expect(runtime.state.name, equals('running'));
    expect(cp.connected, isTrue);
    expect(cp.registered, isTrue);
    expect(cp.heartbeatsStarted, isTrue);

    await runtime.shutdown();
    expect(runtime.state.name, equals('stopped'));
    expect(cp.connected, isFalse);
  });
}
