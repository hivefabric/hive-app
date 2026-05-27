# hive-app

User-facing web application for HiveFabric — chat, hive management, models, and settings.

## What this is

A single-page React app (Vite + TypeScript) that connects to:
- **hive-tenant-gateway** on port 8090 — MCP tool calls, LLM provider management, preferences
- **honeycomb** on port 8080 — node status and management

## Dev setup

```bash
npm install
cp .env.example .env
npm run dev        # http://localhost:3000
npm run build      # production build to dist/
npm run typecheck  # type-check only
```

## Architecture

- **Hash routing** — no react-router; views switch on `window.location.hash`
- **Auth** — Bearer token in `localStorage['hf_token']`; `AuthGate` shows login screen if missing
- **API client** — all calls centralized in `src/api.ts`

## Design system

Material Design 3 / Gemini aesthetic. CSS custom properties only — no Tailwind, no MUI.

Colors:
- `--color-primary: #0B57D0`
- `--color-bg: #F8F9FA`
- `--color-surface: #FFFFFF`
- `--color-sidebar: #1A1A2E`

Typography: Google Sans (loaded from Google Fonts).

## Views

| Hash | Component | Description |
|------|-----------|-------------|
| `#/chat` | `ChatView` | Main chat interface |
| `#/hive` | `HiveView` | Connected comb node grid |
| `#/models` | `ModelsView` | Capability URNs from describe_cluster |
| `#/settings` | `SettingsView` | LLM providers, preferences, API key |

## Key files

- `src/api.ts` — all API calls (gateway + honeycomb)
- `src/types.ts` — shared TypeScript types
- `src/App.tsx` — hash router + Layout wrapper
- `src/components/Sidebar.tsx` — left navigation
- `src/components/AuthGate.tsx` — login/key-entry gate
- `src/styles/global.css` — CSS variables, base styles, layout
- `src/styles/components.css` — reusable component styles

## API endpoints used

### Gateway (port 8090)
- `POST /v1/mcp/tools/call` — run MCP tool (chat, describe_cluster)
- `GET /v1/me/llm-providers` — list LLM providers
- `POST /v1/me/llm-providers` — add LLM provider
- `DELETE /v1/me/llm-providers/:id` — remove LLM provider
- `GET /v1/me/preferences` — get routing preferences
- `POST /v1/me/preferences` — update routing preferences
- `POST /v1/signup` — create account / get API key

### Honeycomb (port 8080)
- `GET /api/nodes` — list registered comb nodes with health metrics

## Commit style

`type: description` — e.g. `feat: add model selector to chat`, `fix: handle 401 on preferences fetch`
