# Agent Note: Produced-file preview browser renderer

Status: implemented

English | [中文](2026-09-06-ui-preview-client-module.zh.md)

## Problem

The produced-file path now has storage (`FileAttachmentStore`), a contract (`dsh-preview`'s `previews` meta + `previewsFromMeta`/`previewKindOf`), an authorization RPC (`session.previewFile`), and a model-facing registrant (`preview_files`). Nothing on the browser consumed them: a produced image had no in-GUI render path, and the only surface (`ui-deliverables`) is workspace-path chips that open in the host OS. The `workspacePathOpen` probe gating that opener was also a module-level probe that reset on every page refresh — the refresh-deactivation follow-up, a later batch.

## Decision

Add `@deepseek-ai/dsh-client-ui-preview`, a dual-face client package, and mount it in the Web patch. The browser half registers `PreviewFiles` into the chat view's `conversation.chat.turnTail` chain and folds produced previews into turn-scoped data via `previewDefinition`, a `ConversationNodeDefinition` that reads the `previews` meta on successful, append-surface `tool/result` events. Entries are content-addressed (deduped by attachment id, first appearance order); failed results, malformed or absent meta, and replacement surface ops contribute nothing.

The row loads each preview's durable bytes through a self-contained `PreviewFileCache` and renders by kind: image (bounded `<img>`), page (sandboxed `<iframe>`), text (decoded), JSON (pretty-printed), and slides/download. `PreviewFileCache` reads `session.readPreviewFile`, caching per Session and releasing browser URLs on Session-scope teardown; this was the deliberate alternative to generalizing `HistoricalImageCache`. Text and JSON render as plain decoded blocks rather than `MarkdownText`/`JsonTree`, which kept the renderer label-light and self-contained; the markdown/JSON-tree presentation can ride on the shared label dictionaries later if a real consumer needs it.

The client half reads previews through the same `owner.turn.data` store the chat view projects — no new service, no model-visible input.

## Alternatives considered

- **Generalize `HistoricalImageCache` and route previews through `ctx.uiConversation`**: the memory listed this as the reuse path, but it touches the mature `ui-conversation` module and its image-only cache. The user chose a self-contained `PreviewFileCache` in `ui-preview` instead (reads `readPreviewFile`), keeping the blast radius inside the new module; a shared cache can be extracted later if a second general-file consumer appears.
- **Render previews through `ui-attachment`'s message-image path**: image-only, and the slot contract is message-scoped, not turn-scoped. Ruled out.
- **A dedicated `PreviewRegistry` provider**: already ruled out — the contract package, `previewFile` RPC, and this renderer cover the seam with no multi-provider variants.

## Consequences

- The package is the first turn-tail occupant alongside `ui-deliverables`; the client slot catalog regenerates to list `client-ui-preview PreviewFiles`.
- `dsh-preview` joins `INLINE_SAFE` so the client bundle can inline the pure `previewsFromMeta`/`previewKindOf` folds; the Web patch and web-app package.json gain the `ui-preview` row and dependency.
- The self-contained `PreviewFileCache` reads `readPreviewFile` and scopes URLs to the Session binding; it does not touch `ui-conversation`'s image cache. PPT thumbnails remain environment-dependent (render as download links until a conversion stack is present).
- Fixing `verify-cordis-config` surfaced a wiring gap left by the earlier produced-file batches: `@deepseek-ai/dsh-tool-preview` and `@deepseek-ai/dsh-attachment-local/file-attachments` were referenced in the base patch but not declared in `packages/bundle/base/package.json` nor mapped in `tsconfig.base.json`. Both were added here so the config gate passes and the tsx source launch resolves them.
