import 'dart:convert';
import 'dart:io';

import '../../core/runtime/honeycomb_runtime.dart';

class HealthServer {
  HealthServer({required this.runtime, this.port = 8091});

  final HoneycombRuntime runtime;
  final int port;
  HttpServer? _server;

  Future<void> start() async {
    _server = await HttpServer.bind(InternetAddress.anyIPv4, port);
    _server!.listen((req) async {
      if (req.uri.path == '/healthz') {
        final body = jsonEncode({'ok': true, 'state': runtime.state.name});
        req.response
          ..headers.contentType = ContentType.json
          ..statusCode = 200
          ..write(body);
      } else {
        req.response.statusCode = 404;
      }
      await req.response.close();
    });
  }

  Future<void> stop() async {
    await _server?.close(force: true);
    _server = null;
  }
}
