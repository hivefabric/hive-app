# hive-app

HiveFabric user application workspace.

## Layout

- `web/` - React/Vite web app for chat, hive management, models, and settings.
- `native/` - Wax native runtime and Flutter shell for desktop, mobile, and headless comb operation.

Each folder has its own dependency graph, build commands, and release workflow.

## Web

```bash
npm --prefix web install
npm run web:dev
npm run web:build
```

The web app connects to `hive-tenant-gateway` on port `8090` and Honeycomb on port `8080`.
Cloud model setup in Settings uses `hive-tenant-gateway` to store LLM provider keys, so the gateway must be running before you enter an OpenAI API key.

## Native

```bash
cd native
dart pub get
dart run headless_main.dart config/honeycomb.example.json
```

For Flutter desktop/mobile:

```bash
cd native/app/flutter_ui
flutter pub get
flutter run
```

## Releases

- Web releases are handled by `.github/workflows/web-ci.yml` and future web deploy workflows.
- Native Wax artifacts are handled by `.github/workflows/native-ci.yml` and `.github/workflows/native-release-artifacts.yml`.

Use dated revision notes in the public and private docs whenever repository layout or service ownership changes.
