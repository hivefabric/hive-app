import 'dart:async';
import 'dart:io';

import '../../infrastructure/networking/health_server.dart';
import '../../infrastructure/networking/logger.dart';
import '../../infrastructure/persistence/config_store.dart';
import '../runtime_factory.dart';

Future<void> runHeadless({required String configPath}) async {
  final logger = HoneycombLogger();
  final config = await ConfigStore(defaultPath: configPath).load();
  final runtime = await buildRuntime(config, configPath: configPath);
  final health = HealthServer(runtime: runtime);

  await runtime.initialize();
  logger.info(
    'waiting for control-plane connection',
    ctx: {
      'mode': config.mode,
      'node_id': config.nodeId,
      'control_plane_url': config.controlPlaneUrl,
    },
  );
  await runtime.start();
  await health.start();

  logger.info(
    'honeycomb runtime started',
    ctx: {
      'mode': config.mode,
      'node_id': config.nodeId,
      'control_plane_url': config.controlPlaneUrl,
      'health_port': health.port,
    },
  );

  final completer = Completer<void>();
  StreamSubscription<ProcessSignal>? sigterm;
  StreamSubscription<ProcessSignal>? sigint;

  Future<void> shutdown() async {
    if (completer.isCompleted) return;
    await health.stop();
    await runtime.shutdown();
    completer.complete();
  }

  sigterm = ProcessSignal.sigterm.watch().listen((_) => shutdown());
  sigint = ProcessSignal.sigint.watch().listen((_) => shutdown());

  await completer.future;
  await sigterm.cancel();
  await sigint.cancel();
}
