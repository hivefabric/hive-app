class AgentRuntime {
  AgentRuntime({
    required this.id,
    required this.startedAt,
    required this.status,
  });

  final String id;
  final DateTime startedAt;
  final String status;

  AgentRuntime copyWith({
    String? status,
  }) {
    return AgentRuntime(id: id, startedAt: startedAt, status: status ?? this.status);
  }

  Map<String, Object?> toJson() => {
        'id': id,
        'startedAt': startedAt.toIso8601String(),
        'status': status,
      };

  static AgentRuntime fromJson(Map<String, Object?> json) => AgentRuntime(
        id: json['id']! as String,
        startedAt: DateTime.parse(json['startedAt']! as String),
        status: json['status']! as String,
      );
}

abstract class AgentRepository {
  Future<void> initialize();
  Future<List<AgentRuntime>> loadDesiredAgents();
  Future<void> persistRuntime(AgentRuntime runtime);
}
