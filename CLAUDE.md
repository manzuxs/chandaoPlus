# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

chandaoPlus is a Chrome extension + local gateway that captures web page content and sends it to AI agents (Claude Code / Codex CLI) for analysis. Its primary use case is ZenTao bug pages — assess, estimate, and get repair suggestions from within the browser.

## Monorepo Structure (pnpm workspaces)

```
apps/
  gateway/          Express server (port 3210) — workspace mgmt, agent spawning, SSE streaming
  extension/        Chrome MV3 extension — content script, background worker, React sidepanel
packages/
  shared/           Zod schemas (contracts.ts), prompt templates (prompt-templates.ts)
  extractor/        HTML→Markdown extraction (Turndown) + image base64 hydration
```

## Common Commands

```bash
pnpm install                          # Install all dependencies
pnpm dev:gateway                      # Start gateway with hot reload (tsx watch)
pnpm dev:extension                    # Start Vite dev build with watch mode
pnpm -r build                         # Build all packages
pnpm -r typecheck                     # Type-check all packages (tsc --noEmit)
pnpm -r test                          # Run all tests (vitest)

# Run a single test file
cd apps/extension && npx vitest run src/recipes/zendao-detail.test.ts

# Build extension for loading as unpacked Chrome extension
pnpm --filter @chandaoplus/extension build
```

## Architecture & Data Flow

**Capture → Enrich → Stream → Analyze**

1. User opens a ZenTao page → clicks extension icon → sidepanel opens
2. Sidepanel sends `CAPTURE_ACTIVE_TAB` message to background worker
3. Background worker forwards `CAPTURE_CURRENT_PAGE` to the content script
4. Content script (`apps/extension/src/content/index.ts`):
   - Extracts HTML → `extractPageCapture()` (Turndown) → markdown + image metadata
   - Hydrates images to base64 via `hydrateImageAssets()`
   - Applies ZenTao recipes for metadata enrichment (bug ID, title, status, assignee)
   - For list pages (`bug-browse-*`): fetches multiple bug detail pages and combines them
5. Sidepanel sends `ChatRequest` (Zod-validated) to `POST /api/chat/stream` on the gateway
6. Gateway writes context bundle to `<workspace>/.chandaoplus/sessions/<uuid>/`:
   - `page.md` — extracted markdown
   - `metadata.json` — URL, title, image manifest
   - `images/` — base64-decoded image files
7. Gateway spawns `claude` or `codex` CLI as a child process with a structured prompt (see `buildPrompt` in `apps/gateway/src/agents/types.ts`)
8. Agent stdout/stderr streams back to the sidepanel via SSE (`text/event-stream`)

## Key Patterns

- **Zod schemas** (`packages/shared/src/contracts.ts`) define all API contracts — `ChatRequest`, `PageCapture`, `ChatStreamChunk`, `WorkspaceProfile`, etc. Types are inferred via `z.infer<>`.
- **Agent Adapter** (`apps/gateway/src/agents/`) — `AgentRegistry` maps `"claude-code"` / `"codex"` to adapters. Each adapter spawns the CLI binary and pipes stdin→prompt, stdout/stderr→SSE chunks. Add new agents by creating an adapter implementing `AgentAdapter` and registering it.
- **Recipes** (`apps/extension/src/recipes/`) — Page-specific detectors for ZenTao. `detectZentaoBugDetail` matches `bug-view-*` URLs, `collectZentaoBugLinks` handles `bug-browse-*` list pages with checkbox selection.
- **Context bundle** (`apps/gateway/src/services/context-bundle-writer.ts`) — Writes captured page data to disk before agent invocation. The agent prompt instructs the CLI to read these files for context.
- **Gateway hardcodes `127.0.0.1:3210`** — both in the sidepanel (`useChatSession.ts`) and `GatewayClient`. No CORS issues since loopback is exempt.

## Configuration

Env vars (loaded via dotenv in `apps/gateway/src/config.ts`):
- `PORT` (default 3210), `CLAUDE_BIN`, `CLAUDE_ARGS`, `CODEX_BIN`, `CODEX_ARGS`
- `WORKSPACE_STORE_PATH` — default `~/.chandaoplus/workspaces.json`

## Testing

- Vitest with jsdom environment for extension tests
- `@testing-library/react` for sidepanel component tests
- Tests exist for contracts, extractor, recipes, gateway-client, background worker, chat routes, workspace store, and App component
