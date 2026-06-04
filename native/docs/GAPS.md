# Wax native runtime - Gaps vs HiveFabric Vision

Date: 2026-06-03

## Role in the system

`hive-app/native` is the cross-platform comb runtime: a Dart/Flutter shell that wraps `hive-sdk/packages/hive-node` and runs on contributor devices in desktop, mobile, and headless modes. The standalone `wax` repository has been merged into `hive-app` so native and web user experiences can share one product repository while retaining separate release workflows.

## Priority gaps

- OwnerPolicy compatibility is present in the UI/runtime path, but the `HONEYCOMB_*` to `WAX_*` env migration still needs one release of dual-name compatibility.
- Network class, reachability, power state, and thermal state reporting still need deeper platform-specific implementation.
- The runtime still uses the HTTP control-plane path today; the target contributor-friendly model is outbound bus connectivity once the NATS/JetStream transport matures in `hive-sdk`.
- Mobile builds still need continued footprint trimming, especially around Docker/server-only execution paths.
- HPKE wrapping at node entry and isolated WASM execution remain future hardening work.
- Native release packaging now lives in `.github/workflows/native-release-artifacts.yml`, but external store distribution and installer packaging remain future work.

## Strengths to preserve

- SDK-first design: Wax delegates comb execution/runtime behavior to `hive-node`.
- Cross-platform Dart/Flutter surface for desktop, mobile, and headless operation.
- Persistent node UUID and single-instance device lock.
- Mobile local-network discovery for development.
- Separate native release artifacts for headless binaries, Flutter desktop bundles, Android APK, and Docker image.
