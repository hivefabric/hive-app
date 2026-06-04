class HoneycombLogger {
  void info(String msg, {Map<String, Object?>? ctx}) {
    _write('INFO', msg, ctx: ctx);
  }

  void warn(String msg, {Map<String, Object?>? ctx}) {
    _write('WARN', msg, ctx: ctx);
  }

  void error(String msg, {Map<String, Object?>? ctx}) {
    _write('ERROR', msg, ctx: ctx);
  }

  void _write(String level, String msg, {Map<String, Object?>? ctx}) {
    final payload = <String, Object?>{
      'level': level,
      'message': msg,
      'ts': DateTime.now().toUtc().toIso8601String(),
      if (ctx != null) 'context': ctx,
    };
    // ignore: avoid_print
    print(payload);
  }
}
