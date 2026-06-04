# CLAUDE.md - hive-app

## What this is

`hive-app` is now the user application workspace for HiveFabric. It contains two independently releasable surfaces:

| Folder | Purpose |
|---|---|
| `web/` | React/Vite web app for chat, hive management, models, settings, and tenant onboarding. |
| `native/` | Wax native runtime and Flutter UI for desktop/mobile/headless comb participation. |

## Release boundary

- Web changes should stay under `web/` unless they need shared documentation or repo-level workflow updates.
- Native/Wax changes should stay under `native/`.
- Each side has separate CI/release workflows under `.github/workflows/`.

## Common commands

```bash
npm run web:typecheck
npm run web:build

cd native
dart pub get
dart analyze
dart test

cd native/app/flutter_ui
flutter pub get
flutter analyze
```

## Architecture notes

- The web app talks to `hive-tenant-gateway` for tenant-scoped operations and to Honeycomb through gateway-backed endpoints where possible.
- Wax remains SDK-first and delegates comb execution/runtime behavior to `hive-sdk/packages/hive-node`.
- The standalone `wax` repository has been merged here under `native/`; new native work should land in this repository.
