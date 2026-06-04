import 'dart:io';

import 'package:honeycomb/platform/headless/bootstrap.dart';

Future<void> main(List<String> args) async {
  final configPath = args.isNotEmpty
      ? args.first
      : Platform.environment['HONEYCOMB_CONFIG'] ?? 'config/honeycomb.example.json';
  await runHeadless(configPath: configPath);
}
