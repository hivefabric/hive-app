import 'dart:convert';
import 'dart:io';

import 'honeycomb_config.dart';

class ConfigStore {
  ConfigStore({required this.defaultPath, Map<String, String>? envOverride})
      : _envOverride = envOverride;

  final String defaultPath;
  final Map<String, String>? _envOverride;

  Future<HoneycombConfig> load() async {
    final fromEnv = _effectiveEnv();

    final file = File(defaultPath);
    HoneycombConfig base;
    if (!await file.exists()) {
      base = HoneycombConfig(
        nodeId: 'honeycomb-node',
        mode: 'headless',
        controlPlaneUrl: 'ws://localhost:8080/ws/honeycomb',
        controlPlaneHttpUrl: 'http://localhost:8080',
        authToken: '',
        ownedHoneycomb: true,
        autoStartAgents: const [],
        sdkCommand: '',
        sdkLibraryPath: '',
      );
    } else {
      final raw = await file.readAsString();
      base = HoneycombConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    }

    return HoneycombConfig(
      nodeId: fromEnv['HONEYCOMB_NODE_ID'] ?? base.nodeId,
      mode: fromEnv['HONEYCOMB_MODE'] ?? base.mode,
      controlPlaneUrl:
          fromEnv['HONEYCOMB_CONTROL_PLANE_URL'] ?? base.controlPlaneUrl,
      controlPlaneHttpUrl: fromEnv['HONEYCOMB_CONTROL_PLANE_HTTP_URL'] ??
          base.controlPlaneHttpUrl,
      authToken: fromEnv['HONEYCOMB_AUTH_TOKEN'] ?? base.authToken,
      ownedHoneycomb:
          _parseBool(fromEnv['HONEYCOMB_OWNED'], base.ownedHoneycomb),
      autoStartAgents: _parseAgents(fromEnv['HONEYCOMB_AUTOSTART_AGENTS']) ??
          base.autoStartAgents,
      sdkCommand: fromEnv['HONEYCOMB_SDK_COMMAND'] ?? base.sdkCommand,
      sdkLibraryPath:
          fromEnv['HONEYCOMB_NODE_LIBRARY_PATH'] ?? base.sdkLibraryPath,
    );
  }

  Map<String, String> _effectiveEnv() {
    final combined = <String, String>{
      ...Platform.environment,
      if (_envOverride != null) ..._envOverride,
    };
    const keys = <String>[
      'HONEYCOMB_MODE',
      'HONEYCOMB_NODE_ID',
      'HONEYCOMB_CONTROL_PLANE_URL',
      'HONEYCOMB_CONTROL_PLANE_HTTP_URL',
      'HONEYCOMB_AUTH_TOKEN',
      'HONEYCOMB_OWNED',
      'HONEYCOMB_AUTOSTART_AGENTS',
      'HONEYCOMB_SDK_COMMAND',
      'HONEYCOMB_NODE_LIBRARY_PATH',
    ];

    for (final key in keys) {
      if (combined.containsKey(key)) continue;
      final value = _compileTimeEnv(key);
      if (value != null && value.isNotEmpty) {
        combined[key] = value;
      }
    }
    return combined;
  }

  bool _parseBool(String? value, bool fallback) {
    if (value == null || value.isEmpty) return fallback;
    final normalized = value.toLowerCase();
    if (normalized == 'true' || normalized == '1' || normalized == 'yes') {
      return true;
    }
    if (normalized == 'false' || normalized == '0' || normalized == 'no') {
      return false;
    }
    return fallback;
  }

  List<String>? _parseAgents(String? value) {
    if (value == null) return null;
    return value
        .split(',')
        .map((v) => v.trim())
        .where((v) => v.isNotEmpty)
        .toList(growable: false);
  }

  String? _compileTimeEnv(String key) {
    switch (key) {
      case 'HONEYCOMB_MODE':
        return const String.fromEnvironment('HONEYCOMB_MODE');
      case 'HONEYCOMB_NODE_ID':
        return const String.fromEnvironment('HONEYCOMB_NODE_ID');
      case 'HONEYCOMB_CONTROL_PLANE_URL':
        return const String.fromEnvironment('HONEYCOMB_CONTROL_PLANE_URL');
      case 'HONEYCOMB_CONTROL_PLANE_HTTP_URL':
        return const String.fromEnvironment('HONEYCOMB_CONTROL_PLANE_HTTP_URL');
      case 'HONEYCOMB_AUTH_TOKEN':
        return const String.fromEnvironment('HONEYCOMB_AUTH_TOKEN');
      case 'HONEYCOMB_OWNED':
        return const String.fromEnvironment('HONEYCOMB_OWNED');
      case 'HONEYCOMB_AUTOSTART_AGENTS':
        return const String.fromEnvironment('HONEYCOMB_AUTOSTART_AGENTS');
      case 'HONEYCOMB_SDK_COMMAND':
        return const String.fromEnvironment('HONEYCOMB_SDK_COMMAND');
      case 'HONEYCOMB_NODE_LIBRARY_PATH':
        return const String.fromEnvironment('HONEYCOMB_NODE_LIBRARY_PATH');
      default:
        return null;
    }
  }
}
