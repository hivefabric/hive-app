import 'dart:async';

import '../../infrastructure/background/hive_node_bridge.dart';
import 'comb_models.dart';

class CombNodeManager {
  CombNodeManager({
    required this.bridge,
    required this.nodeIdentity,
  });

  final HiveNodeBridge bridge;
  final NodeIdentity nodeIdentity;

  final StreamController<NodeMetrics> _metrics =
      StreamController<NodeMetrics>.broadcast();

  Timer? _metricsTimer;
  int _activeAgents = 0;

  Stream<NodeMetrics> get metricsStream => _metrics.stream;

  Future<void> initialize() async {
    await bridge.initialize();
  }

  Future<void> start() async {
    await bridge.startNode();
    _startMetricsLoop();
  }

  Future<void> shutdown() async {
    _metricsTimer?.cancel();
    _metricsTimer = null;
    await bridge.stopNode();
    await _metrics.close();
  }

  void setActiveAgents(int count) {
    _activeAgents = count;
  }

  void _startMetricsLoop() {
    _metricsTimer?.cancel();
    _metricsTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      if (_metrics.isClosed) {
        return;
      }
      final snapshot = await bridge.fetchMetrics(activeAgents: _activeAgents);
      _metrics.add(snapshot);
    });
  }
}
