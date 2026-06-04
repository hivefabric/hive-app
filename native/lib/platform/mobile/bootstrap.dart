import '../../core/runtime/honeycomb_runtime.dart';
import '../../infrastructure/persistence/config_store.dart';
import '../runtime_factory.dart';

Future<HoneycombRuntime> startMobileRuntime({required String configPath}) async {
  final config = await ConfigStore(defaultPath: configPath).load();
  final runtime = await buildRuntime(config, configPath: configPath);
  await runtime.initialize();
  await runtime.start();
  return runtime;
}
