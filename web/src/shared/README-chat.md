# Chat UI: Open-Source Alternatives Analysis

## Summary

This document evaluates whether an existing open-source chat UI would be a better fit for
HiveFabric than the current custom `ChatView` implementation.

---

## Option A: Open WebUI (formerly Ollama WebUI)

- **Repo:** https://github.com/open-webui/open-webui
- **Stack:** SvelteKit + Python backend
- **OpenAI compatibility:** Full `/v1/chat/completions` support
- **Pros:**
  - Fully featured (file attachments, image generation, RAG, tool calls)
  - Actively maintained, large community
  - Mobile PWA out of the box
  - Works as an alternative front-end if the gateway exposes an Ollama-compatible API
- **Cons:**
  - Heavyweight (~200 MB Docker image, Python + Node)
  - Different stack (SvelteKit) — not embeddable into this React app
  - Would require the gateway to expose `/v1/chat/completions` or `/api/chat`
  - HiveFabric auth, queen routing, and privacy indicators would need to be reimplemented
    or bypassed
- **Integration path:** HiveFabric COULD expose an Ollama-compatible `/api/chat` endpoint
  on the gateway. This would make Open WebUI a viable power-user front-end alternative
  without replacing the embedded ChatView.

---

## Option B: Chatbot UI (mckaywrigley)

- **Repo:** https://github.com/mckaywrigley/chatbot-ui
- **Stack:** Next.js 13 + React + Supabase
- **Pros:**
  - Clean, minimal UI
  - React-based — closer to our stack
- **Cons:**
  - Requires Next.js and Supabase — not embeddable into a Vite SPA
  - Auth and routing are tightly coupled to Supabase
  - No longer actively maintained in its original minimal form (now includes a full
    backend)
  - Significant adaptation work to strip Next.js and wire in HiveFabric auth

---

## Option C: Keep Current + Enhance (Recommended)

- **Current implementation:** ~360 lines in `ChatView.tsx`
- **Already integrated with:**
  - HiveFabric Bearer token auth
  - Queen routing preferences
  - Privacy indicator (local vs. cloud queen)
  - LocalStorage session persistence
  - Hash-based routing (no react-router dependency)

### Missing features (addressable incrementally)

| Feature | Plan | Status |
|---------|------|--------|
| Markdown rendering | `marked` library (2 KB gzipped) | Done |
| Token streaming | SSE/WebSocket — Phase 2 | Planned |
| Code syntax highlighting | `highlight.js` or inline CSS | Planned |
| File attachments | Gateway MCP tool extension | Future |
| Session rename | Double-click inline edit | Done |

---

## Recommendation

**Keep the current ChatView and enhance it incrementally.**

The existing integration with HiveFabric auth, queen routing, and privacy indicators is
valuable enough to justify the maintenance cost of a custom UI. The open-source alternatives
(Open WebUI, Chatbot UI) would require significant adaptation work to wire into the
HiveFabric routing layer, and both carry dependency weight that outweighs the benefit for
the current scope.

### Near-term additions (Phase 1 — done)

1. **Markdown rendering** — `marked` library for AI response formatting
2. **Session rename** — double-click inline edit with `<SessionTitle>` component

### Phase 2 (planned)

1. **Token streaming** — SSE from the gateway; update the AI message bubble incrementally
2. **Code highlighting** — add `highlight.js` or a lightweight CSS theme for `<pre><code>`

---

## Note: Ollama-compatible gateway endpoint

HiveFabric COULD expose an Ollama-compatible `/api/chat` endpoint on the gateway. This
would allow Open WebUI (or any other Ollama-compatible client) to be pointed at the gateway
as an alternative front-end for power users, without changing the embedded chat experience
for regular users.

Endpoint contract needed:

```
POST /api/chat
{
  "model": "<queen_model>",
  "messages": [...],
  "stream": false
}
```

Response follows Ollama's non-streaming format. This is a low-effort addition to the
gateway that unlocks a large ecosystem of existing clients.
