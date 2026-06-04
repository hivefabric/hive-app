# hive-app/web

User-facing web application for HiveFabric: chat, hive management, models, settings, and onboarding.

## What this is

A single-page React app (Vite + TypeScript) that connects to:

- `hive-tenant-gateway` on port `8090` for MCP tool calls, LLM provider management, preferences, and tenant operations.
- `honeycomb` on port `8080` through gateway-backed or direct local endpoints for node status and management.

## Dev setup

From the `hive-app` repo root:

```bash
npm --prefix web install
npm run web:dev
npm run web:build
npm run web:typecheck
```

From this folder directly:

```bash
npm install
npm run dev
npm run build
npm run typecheck
```

## Architecture

- Hash routing: no react-router; views switch on `window.location.hash`.
- Auth: bearer token in `localStorage['hf_token']`; `AuthGate` shows login screen if missing.
- API client: all calls are centralized in `web/src/api.ts`.

## Design system

Material Design 3 / Gemini aesthetic. CSS custom properties only; no Tailwind or MUI.

## Key files

- `web/src/api.ts` - all API calls.
- `web/src/types.ts` - shared TypeScript types.
- `web/src/App.tsx` - hash router and layout wrapper.
- `web/src/components/Sidebar.tsx` - left navigation.
- `web/src/components/AuthGate.tsx` - login/key-entry gate.
- `web/src/styles/global.css` - CSS variables, base styles, layout.
- `web/src/styles/components.css` - reusable component styles.

## Release boundary

Web releases are independent from native Wax releases. Keep web-only changes under `web/` unless the root workspace docs or workflow files also need updates.
