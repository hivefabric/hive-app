import 'dart:io';

import 'package:honeycomb/infrastructure/persistence/config_store.dart';
import 'package:test/test.dart';

void main() {
  group('ConfigStore', () {
    test('loads config from json file', () async {
      final tmp = await Directory.systemTemp.createTemp(
        'honeycomb-config-test',
      );
      final file = File('${tmp.path}/config.json');
      await file.writeAsString('''
{
  "nodeId": "node-test",
  "mode": "headless",
  "controlPlaneUrl": "ws://localhost:8080/ws/honeycomb",
  "controlPlaneHttpUrl": "http://localhost:8080",
  "authToken": "token-1",
  "ownedHoneycomb": true,
  "autoStartAgents": ["agent-a", "agent-b"],
  "sdkCommand": "cargo run --manifest-path ../hive-sdk/Cargo.toml -p hive-node --example headless_server",
  "sdkLibraryPath": "/tmp/libhive_node.dylib"
}
''');

      final config = await ConfigStore(defaultPath: file.path).load();

      expect(config.nodeId, equals('node-test'));
      expect(config.mode, equals('headless'));
      expect(config.authToken, equals('token-1'));
      expect(config.autoStartAgents, equals(['agent-a', 'agent-b']));
      expect(config.sdkCommand, contains('hive-node'));
      expect(config.sdkLibraryPath, equals('/tmp/libhive_node.dylib'));

      await tmp.delete(recursive: true);
    });

    test('returns default config when file is missing', () async {
      final missingPath =
          '${Directory.systemTemp.path}/missing-honeycomb-config-${DateTime.now().microsecondsSinceEpoch}.json';
      final config = await ConfigStore(defaultPath: missingPath).load();

      expect(config.nodeId, equals('honeycomb-node'));
      expect(config.mode, equals('headless'));
      expect(
        config.controlPlaneUrl,
        equals('ws://localhost:8080/ws/honeycomb'),
      );
      expect(config.sdkCommand, equals(''));
      expect(config.sdkLibraryPath, equals(''));
    });

    test('applies env overrides even without mode override', () async {
      final tmp = await Directory.systemTemp.createTemp(
        'honeycomb-config-env-overlay',
      );
      final file = File('${tmp.path}/config.json');
      await file.writeAsString('''
{
  "nodeId": "node-file",
  "mode": "headless",
  "controlPlaneUrl": "ws://localhost:8080/ws/honeycomb",
  "controlPlaneHttpUrl": "http://localhost:8080",
  "authToken": "token-file",
  "ownedHoneycomb": true,
  "autoStartAgents": ["agent-file"],
  "sdkCommand": "",
  "sdkLibraryPath": ""
}
''');

      final config = await ConfigStore(
        defaultPath: file.path,
        envOverride: const {
          'HONEYCOMB_CONTROL_PLANE_HTTP_URL': 'http://192.168.1.171:8080',
          'HONEYCOMB_CONTROL_PLANE_URL': 'ws://192.168.1.171:8080/ws/honeycomb',
          'HONEYCOMB_AUTH_TOKEN': 'token-env',
          'HONEYCOMB_OWNED': 'false',
          'HONEYCOMB_AUTOSTART_AGENTS': 'agent-a,agent-b',
        },
      ).load();

      expect(config.mode, equals('headless'));
      expect(config.controlPlaneHttpUrl, equals('http://192.168.1.171:8080'));
      expect(
        config.controlPlaneUrl,
        equals('ws://192.168.1.171:8080/ws/honeycomb'),
      );
      expect(config.authToken, equals('token-env'));
      expect(config.ownedHoneycomb, isFalse);
      expect(config.autoStartAgents, equals(['agent-a', 'agent-b']));

      await tmp.delete(recursive: true);
    });
  });
}
