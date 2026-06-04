class RuntimeEvent {
  RuntimeEvent({
    required this.kind,
    required this.message,
    required this.timestamp,
    this.payload,
  });

  final String kind;
  final String message;
  final DateTime timestamp;
  final Map<String, Object?>? payload;
}
