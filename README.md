# chandaoPlus

## Prerequisites
- Node.js 20+
- pnpm 9+
- `claude` and/or `codex` available in PATH
- Chrome or Chromium with Developer Mode enabled

## Start
1. `pnpm install`
2. `pnpm --filter @chandaoplus/gateway dev`
3. `pnpm --filter @chandaoplus/extension build`
4. Load `apps/extension/dist` as an unpacked extension
5. Open the sidepanel and add a workspace that points at your project root

## Smoke Test: ZenTao Detail
1. Open `bug-view-123.html`
2. Open the sidepanel
3. Choose a workspace
4. Click `评估`
5. Confirm the streamed response includes工期 and修复建议

## Smoke Test: ZenTao List
1. Open `bug-browse-1.html`
2. Check two bug rows
3. Open the sidepanel
4. Click `评估`
5. Confirm the sidepanel shows batch progress and a combined answer
