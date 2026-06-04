import 'agent_model.dart';

class AgentManager {
  AgentManager({required this.repository});

  final AgentRepository repository;
  final Map<String, AgentRuntime> _running = {};

  Future<void> initialize() async {
    await repository.initialize();
  }

  Future<void> restoreAgents() async {
    final agents = await repository.loadDesiredAgents();
    for (final agent in agents) {
      await startAgent(agent.id);
    }
  }

  Future<void> startAgent(String id) async {
    if (_running.containsKey(id)) return;
    final runtime = AgentRuntime(id: id, startedAt: DateTime.now().toUtc(), status: 'running');
    _running[id] = runtime;
    await repository.persistRuntime(runtime);
  }

  Future<void> stopAgent(String id) async {
    final runtime = _running.remove(id);
    if (runtime == null) return;
    await repository.persistRuntime(runtime.copyWith(status: 'stopped'));
  }

  List<AgentRuntime> listRuntimes() => _running.values.toList(growable: false);

  Future<void> shutdown() async {
    final ids = _running.keys.toList(growable: false);
    for (final id in ids) {
      await stopAgent(id);
    }
  }
}
