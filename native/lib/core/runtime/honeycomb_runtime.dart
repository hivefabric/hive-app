import 'dart:async';

import '../agents/agent_manager.dart';
import '../comb/comb_node_manager.dart';
import '../control_plane/control_plane_client.dart';
import '../lifecycle/runtime_events.dart';
import '../lifecycle/runtime_state.dart';

abstract class HoneycombRuntime {
  Future<void> initialize();
  Future<void> start();
  Future<void> shutdown();
  RuntimeState get state;
  Stream<RuntimeState> get states;
  Stream<RuntimeEvent> get events;
}

class DefaultHoneycombRuntime implements HoneycombRuntime {
  DefaultHoneycombRuntime({
    required this.combNodeManager,
    required this.controlPlaneClient,
    required this.agentManager,
  });

  final CombNodeManager combNodeManager;
  final ControlPlaneClient controlPlaneClient;
  final AgentManager agentManager;

  RuntimeState _state = RuntimeState.created;
  final StreamController<RuntimeState> _states =
      StreamController<RuntimeState>.broadcast();
  final StreamController<RuntimeEvent> _events =
      StreamController<RuntimeEvent>.broadcast();

  StreamSubscription<ControlPlaneCommand>? _commandSubscription;

  @override
  RuntimeState get state => _state;

  @override
  Stream<RuntimeState> get states => _states.stream;

  @override
  Stream<RuntimeEvent> get events => _events.stream;

  @override
  Future<void> initialize() async {
    _setState(RuntimeState.initializing);
    await combNodeManager.initialize();
    await agentManager.initialize();
    _emit('runtime.initialize', 'Honeycomb runtime initialized');
    _setState(RuntimeState.initialized);
  }

  @override
  Future<void> start() async {
    _setState(RuntimeState.starting);
    _setState(RuntimeState.waitingForConnection);
    await _waitForControlPlaneConnection();
    await combNodeManager.start();
    await controlPlaneClient.registerNode(combNodeManager.nodeIdentity);
    await controlPlaneClient.startHeartbeat(combNodeManager.metricsStream);

    _commandSubscription = controlPlaneClient.commands.listen((command) {
      _emit('control-plane.command', 'Received control-plane command',
          payload: command.payload);
    });

    await agentManager.restoreAgents();
    _emit('runtime.start', 'Honeycomb runtime started');
    _setState(RuntimeState.running);
  }

  @override
  Future<void> shutdown() async {
    _setState(RuntimeState.stopping);
    await _commandSubscription?.cancel();
    await agentManager.shutdown();
    await combNodeManager.shutdown();
    await controlPlaneClient.disconnect();
    _emit('runtime.shutdown', 'Honeycomb runtime stopped');
    _setState(RuntimeState.stopped);
    await _events.close();
    await _states.close();
  }

  void _setState(RuntimeState next) {
    _state = next;
    _states.add(next);
  }

  void _emit(String kind, String message, {Map<String, Object?>? payload}) {
    _events.add(RuntimeEvent(
      kind: kind,
      message: message,
      timestamp: DateTime.now().toUtc(),
      payload: payload,
    ));
  }

  Future<void> _waitForControlPlaneConnection() async {
    final ready = Completer<void>();
    late final StreamSubscription<ControlPlaneConnectionState> subscription;

    subscription = controlPlaneClient.connectionStates.listen((state) {
      _emit(
        'control-plane.connection',
        'Control-plane connection state: ${state.name}',
        payload: {'state': state.name},
      );
      if (state == ControlPlaneConnectionState.connected &&
          !ready.isCompleted) {
        ready.complete();
      }
    });

    try {
      await controlPlaneClient.connect();
      await ready.future.timeout(
        const Duration(seconds: 45),
        onTimeout: () => throw TimeoutException(
          'control-plane connection timed out after 45s',
        ),
      );
    } finally {
      await subscription.cancel();
    }
  }
}
