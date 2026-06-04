# Wax native app

> **HiveFabric product context.** Product vision, architecture, and economics are documented in the private docs repo (`hivefabric/.github-private`). Start with the **HiveFabric Vision Review (2026-05-13)**, then device heterogeneity, AGNTCY interop, and scaling + resilience. This README is technical-only. Gaps against the reviewed vision are tracked in [`docs/GAPS.md`](docs/GAPS.md).
>
> This is **Wax** — the executor runtime running on each Comb. Repo renamed 2026-05-15 from `honeycomb/`. Dart package + Flutter app names ("Honeycomb") are still in transition; the runtime env vars (`HONEYCOMB_*`) remain valid through Phase 1 with `WAX_*` aliases planned for Phase 2.

Wax is the cross-platform HiveFabric node runtime built with Dart/Flutter. It now lives in `hive-app/native`; the old standalone `wax` repository has been merged into this app workspace.

Honeycomb is SDK-first: it consumes `hive-sdk/packages/hive-node` for node execution/runtime behavior instead of re-implementing that logic in Dart.

Modes:
- Desktop Flutter app
- Mobile Flutter app
- Headless container/server runtime

## Repository Layout

- `lib/core/`: platform-agnostic runtime orchestration
- `lib/infrastructure/`: persistence, logging, networking, background bridge
- `lib/platform/`: mode bootstraps (`desktop`, `mobile`, `headless`)
- `app/flutter_ui/`: Flutter UI shell wired to runtime state/events
- `headless_main.dart`: pure Dart headless entrypoint
- `main.dart`: Flutter entrypoint forwarding to `app/flutter_ui`
- `docker/Dockerfile`: production headless container image

## SDK Dependency Behavior

Honeycomb resolves node runtime from SDK in this order:
1. `HONEYCOMB_NODE_COMMAND`
2. `HONEYCOMB_SDK_COMMAND` / `sdkCommand` in config
3. default local workspace command:
   `cargo run --manifest-path ../../hive-sdk/Cargo.toml -p hive-node --example headless_server`

When `HONEYCOMB_NODE_LIBRARY_PATH` / `sdkLibraryPath` is provided, Honeycomb also reads `hive-node` bootstrap metadata via FFI to populate node identity/capabilities.

## Configuration

Use env vars or JSON config (`config/honeycomb.example.json`).

Main env vars:
- `HONEYCOMB_NODE_ID`
- `HONEYCOMB_CONTROL_PLANE_URL`
- `HONEYCOMB_CONTROL_PLANE_HTTP_URL`
- `HONEYCOMB_AUTH_TOKEN`
- `HONEYCOMB_MODE=headless|desktop|mobile`
- `HONEYCOMB_OWNED`
- `HONEYCOMB_AUTOSTART_AGENTS`
- `HONEYCOMB_NODE_COMMAND` (explicit node command override)
- `HONEYCOMB_SDK_COMMAND` (preferred SDK node command)
- `HONEYCOMB_NODE_LIBRARY_PATH` (optional FFI bridge to `hive-node` dylib)
- `HONEYCOMB_NODE_LISTEN_ADDR` (embedded node API bind, default `0.0.0.0:7070`)
- `HONEYCOMB_NODE_API_BASE_URL` (address advertised to control-plane for `/execute`)
- `HONEYCOMB_NODE_HEARTBEAT_INTERVAL_SECONDS` (embedded node telemetry/heartbeat cadence, default `3`)
- `HONEYCOMB_NODE_ID_FILE` (persistent node UUID file path; defaults to `~/.honeycomb/node_ids/<nodeId>.node_id`)
- `HONEYCOMB_DEVICE_LOCK_PATH` (single-instance device lock path; default `~/.honeycomb/device.instance.lock`)
- `HONEYCOMB_ALLOW_MULTI_INSTANCE=true` (override single-instance guard)
- `HONEYCOMB_VIRTUALIZATION_TYPE` (e.g. `docker`, `kvm`) to mark instance as virtualized
- `HONEYCOMB_DEV_SCAN_LOCAL_NETWORK=true|false` (mobile dev fallback: if control-plane host is `localhost`, scan LAN for `/healthz`)

## Run Headless

```bash
cd native
dart pub get
dart run headless_main.dart config/honeycomb.example.json
```

## Run Flutter UI (Desktop/Mobile)

```bash
cd native/app/flutter_ui
flutter pub get
flutter run -d macos \
  --dart-define=HONEYCOMB_MODE=desktop \
  --dart-define=HONEYCOMB_NODE_ID=honeycomb-desktop-1 \
  --dart-define=HONEYCOMB_CONTROL_PLANE_URL=ws://localhost:8080/ws/honeycomb \
  --dart-define=HONEYCOMB_CONTROL_PLANE_HTTP_URL=http://localhost:8080 \
  --dart-define=HONEYCOMB_AUTH_TOKEN=dev-hive-key \
  --dart-define=HONEYCOMB_SDK_COMMAND='cargo run --manifest-path ../../hive-sdk/Cargo.toml -p hive-node --example headless_server'
```

Desktop prerequisites:
- Hive control-plane API/UI running (`http://localhost:8080` + `http://localhost:5175`)
- Rust toolchain (`cargo`) installed
- Flutter desktop platform enabled (`flutter config --enable-macos-desktop`, `--enable-windows-desktop`, or `--enable-linux-desktop`)

Mobile/local-network note:
- If your phone cannot reach `localhost`, set the control-plane host IP in the Honeycomb splash screen field and press `Reconnect`.
- In debug/dev mode Honeycomb can auto-scan the local `/24` network when config still points to `localhost` (can be disabled with `HONEYCOMB_DEV_SCAN_LOCAL_NETWORK=false`).

## Build Android APK

Phase 1 status: the APK builds, installs, registers as a Comb, sends heartbeats,
reports its accelerator tier, and respects the OwnerPolicy fields configured
in-app. Heavy WASM execution on Android is **Phase 3** — the comb will receive
tasks but refuses anything outside its declared `allowed_sensitivity` /
`blocked_capability_urns` policy.

### One-command build (debug)

```bash
cd native/app/flutter_ui
flutter pub get
flutter build apk --debug
```

`flutter build apk --debug` is the fastest way to confirm the toolchain works
on your machine. Output: `build/app/outputs/flutter-apk/app-debug.apk`.

### Release build with control-plane URL baked in

```bash
cd native/app/flutter_ui
flutter pub get
flutter build apk --release \
  --dart-define=HONEYCOMB_MODE=mobile \
  --dart-define=HONEYCOMB_CONTROL_PLANE_URL=ws://<CONTROL_PLANE_HOST>:8080/ws/honeycomb \
  --dart-define=HONEYCOMB_CONTROL_PLANE_HTTP_URL=http://<CONTROL_PLANE_HOST>:8080 \
  --dart-define=HONEYCOMB_AUTH_TOKEN=dev-hive-key
```

You do **not** need to set `HONEYCOMB_NODE_ID`. On first launch Wax generates a
UUIDv4 and persists it via `shared_preferences`; subsequent launches reuse the
same id so Honeycomb sees the same comb. If you do pass a `HONEYCOMB_NODE_ID`
dart-define, it overrides and persists that value instead.

### Install & first launch

```bash
adb install -r build/app/outputs/flutter-apk/app-release.apk
# or for the debug build:
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

First-launch checklist:

1. **Grant the notification permission** when prompted (Android 13+). The
   foreground-service notification — *"HiveFabric is contributing — you're in
   control. Tap to pause."* — is required by Android to keep Wax alive while
   the screen is off.
2. **Set the Honeycomb URL** in the splash-screen field if your phone cannot
   reach `localhost`. Wax also auto-scans the local `/24` for a `/healthz`
   endpoint in debug mode.
3. **Open the policy editor** (shield icon in the AppBar, or `Policy` button on
   the splash) to review the OwnerPolicy. Defaults are *only-when-charging,
   only-on-Wi-Fi, battery >= 30%, quiet hours 22:00 – 07:00, public-only*.
   Saved values are sent on the next register/heartbeat.
4. **Verify registration**: the dashboard should show a node row with your
   device name, the persisted `node_id`, `accelerator_tier: cpu`, and the
   policy you configured.

### Smaller APK per ABI

```bash
flutter build apk --release --split-per-abi
```

### Troubleshooting

- **App never registers**: phone is on cellular while `only_on_wifi=true`, or
  the IP entered in the splash field isn't reachable. Check with
  `adb shell ping <CONTROL_PLANE_HOST>`.
- **Airplane mode / VPN / corporate Wi-Fi**: the dashboard's HTTP port (8080)
  is often firewalled. Either disable VPN or run Honeycomb on the same Wi-Fi.
- **App killed when phone is idle**: Doze mode + OEM battery-killers
  (Xiaomi, OPPO, Samsung) regularly murder background services. See
  [Don't Kill My App!](https://dontkillmyapp.com/) for vendor-specific
  exemption flows. Wax requests `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`; the
  user still has to confirm in Settings.
- **`flutter_background` initialization fails**: usually means the user
  rejected the notification permission. Reinstall and accept on first launch.
- **Heartbeats stop after backgrounding**: confirm the persistent notification
  is visible in the shade. If absent, the foreground service was killed —
  re-open Wax and accept the notification permission.

## Build Docker Image

```bash
cd native
docker build -f docker/Dockerfile -t local/wax:dev .
docker run --rm -p 8091:8091 \
  -e HONEYCOMB_CONTROL_PLANE_URL=ws://host.docker.internal:8080/ws/honeycomb \
  -e HONEYCOMB_CONTROL_PLANE_HTTP_URL=http://host.docker.internal:8080 \
  -e HONEYCOMB_AUTH_TOKEN=dev-hive-key \
  local/wax:dev
```

## GitHub Release Artifacts

Workflow: `.github/workflows/native-release-artifacts.yml`

It builds and publishes:
- Headless binaries (`Linux`, `macOS`, `Windows`)
- Flutter UI desktop bundles (`Linux`, `macOS`, `Windows`)
- Android APK (`app-release.apk`)
- Headless Docker image tarball

On `main`, it also:
- Pushes Docker image tags to GHCR (`main`, `latest`, `sha-*`)

On tags like `v0.1.0`, it also:
- Attaches all artifacts to the GitHub Release
- Pushes Docker image to GHCR: `ghcr.io/<org>/wax:<tag>`
