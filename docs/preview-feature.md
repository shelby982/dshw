# Produced-File Preview: design and implementation

English | [中文](preview-feature.zh.md)

This reference describes how the Harness previews produced files (images, HTML, slides, documents) inside the `dsh` Web GUI, and records the design decisions and implementation history of that seam. It is a current-state reference, not a tutorial: by now the preview path is a complete capability seam (storage, contract, authorization RPC, model-facing registrant, browser renderer), so this document defines that scope and the choices that shaped it.

## Background and goals

The user's goal was to preview a file an agent produced (an image, a PPTX, an HTML page) after it was generated: see the rendered file and its effect inside the Web GUI, with session persistence, rebuild-on-refresh, agent triggerability, and coverage of every file type. The previous implementation was a Web plugin whose activation was lost on every refresh and required re-activation, which is the problem this design replaces.

## Why the previous plugin failed

The old path rendered produced files through a Web plugin that did not survive a page refresh. Its workspace-path probe (`workspacePathOpen`) was a module-level one-shot that reset on every refresh, and non-image files were only opened in the host OS. The replacement design moves the preview into a durable, session-log-derived seam so a refresh reconstructs the same preview rows.

## Architecture: the produced-file preview seam

The preview path is a complete capability seam, not a single provider. Its roles are split across packages so each piece (storage, contract, authorization, registrant, renderer) can evolve independently:

- **Storage** — `ctx.fileAttachments` (`FileAttachmentStore`), a content-addressed general-file attachment store, provided by `@deepseek-ai/dsh-attachment-local/file-attachments`.
- **Contract** — `@deepseek-ai/dsh-preview` owns the durable produced-file vocabulary: the tool-result `previews` metadata payload and the pure readers `previewsFromMeta`, `previewKindOf`, `mediaTypeOf`.
- **Authorization RPC** — `sessionController.previewFile` and its client verb `readPreviewFile` read a recorded `FileAttachmentRef` back to the session that produced it.
- **Model-facing registrant** — `@deepseek-ai/dsh-tool-preview` exposes the `preview_files` tool, which reads a produced file from the session workspace, stores its bytes, and records the resulting durable reference.
- **Automatic registration** — `@deepseek-ai/dsh-tool-fs` folds a `previews` payload into the result of a `write`/`edit`, so the model need not call `preview_files` explicitly.
- **PPT thumbnail** — `@deepseek-ai/dsh-tool-preview` converts a PPTX to a single-page PNG thumbnail (LibreOffice `soffice` → PDF, poppler `pdftoppm` → PNG), degrading to the original file when the stack is absent.
- **Browser renderer** — `@deepseek-ai/dsh-client-ui-preview` registers the preview row into the chat view's `conversation.chat.turnTail` chain: `PreviewDefinition` folds `meta.previews` into turn-scoped data, `PreviewFileCache` reads persisted bytes per session, and `PreviewFiles` renders by kind.

## Core design decisions

- **Reuse the attachment addressing layer.** Produced files are stored as content-addressed objects through `ctx.fileAttachments`, not a widened image-only path.
- **Produced previews ride tool-result private `meta`.** The `previews` payload is tool-owned, JSON-serializable, and never model-visible; it is logged with the session log so a renderer can rebuild the row without any model-visible content carrying the file digest. It does not change the session format or bump `SESSION_FORMAT_VERSION`.
- **PPT to image thumbnail.** A produced PPTX becomes a PNG thumbnail when the LibreOffice + poppler conversion stack is present; otherwise the tool degrades to the original PPTX (a download link).
- **Scope it once, cover every produced file.** The seam handles all produced files, not just images.
- **Skip a dedicated `PreviewRegistry` provider.** Its responsibility (contract + RPC + renderer) needs no multi-provider variants, so a registry would be premature abstraction.
- **Self-contained `PreviewFileCache`.** The browser half builds its own cache reading `readPreviewFile`, reusing the container's lifecycle shape but not generalizing `HistoricalImageCache`.
- **The `#6` refresh-loss item is memory-expired.** The prior concern (a module-level workspace probe) is already answered by `ui-deliverables`' reconnect-time re-probe; refresh re-applies plugins and re-detects, so there is no refresh-loss behavior.
- **`#3` ui-conversation domain layering.** `input/editor` mixed the input machine's model augmentations with the composer bar's self-contained text-surface binders. The three binders moved into `skeleton/editor/`, so `skeleton` (the composer presentation) owns its surface while `input` keeps the machine and its editor model augmentations; `verify-client-domain-graph` drops 3 → 0.

## End-to-end data flow

1. The model calls `preview_files` (or a `fs` `write`/`edit` auto-registers), naming a produced file path.
2. `preview_files` reads the file bytes from the session workspace (`ctx.fs.readBytes`, capped by `maxPreviewBytes`), stores them via `ctx.fileAttachments.saveFile`, and for a PPTX first converts it to a PNG thumbnail.
3. The tool result carries a private `previews` metadata payload (`ProducedPreview[]`: a durable `FileAttachmentRef` plus a kind hint). It is logged and never reaches the model.
4. The browser's `PreviewDefinition` (a `ConversationNodeDefinition` on the turn-tail chain) folds `meta.previews` into turn-scoped data, deduplicated by attachment id and in first-seen order.
5. `PreviewFiles` renders each preview by kind: image (bounded `<img>`), page (sandboxed `<iframe>`), text/JSON (decoded `<pre>`), slides/download. `PreviewFileCache` resolves the reference through `session.readPreviewFile` into a browser URL, scoped to the session and released on its teardown.
6. On refresh, the session log replays the window; `previewDefinition` re-folds the same `previews` meta, so the row is rebuilt.

## Bugs found and fixed

- **Two latent `inject` omissions.** `preview_files` did not inject `fs`/`fileAttachments` (so every execution threw "cannot get property 'fs' without inject"), and the session controller's `previewFile` RPC did not inject `fileAttachments` (so the renderer could not read bytes). Both were fixed.
- **Preview row lost after refresh (mid-Turn window).** The history paginator cut a reload window at the `maxMessages`-th append-origin message's `groupStart`, ignoring `turn/start`, so a window could begin mid-Turn. A turn-scoped node such as `previewDefinition` needs that turn's `turn/start` to publish its turn data; without it the row vanished after refresh while messages still rendered (content projection is independent of the turn boundary). The fix aligns the `paginate` cut back to the nearest `turn/start` at or before it, so `follow()` (refresh window) and `page()` (loadOlder) both start on a turn boundary; the frontend's `loadOlder` uses the window's first seq as `beforeSeq`, so pages stay contiguous.

## Gates and verification

The feature is deterministic-gate-clean: `doc-sync` 32/0, lint 0, `gen-tool-catalog` (with `tool-preview` registered), `config-catalog`, `cordis-inspect-catalog`, `verify-export-jsdoc`, `doc-graphs` (with `fileAttachments` classified in the capability-seam roles), `translation-pairing`, and per-file 100% coverage. Browser verification drove a real model turn: a preview row rendered with sandboxed HTML in an iframe.

## Known limitations and deferred work

- **The producing tools do not exist yet.** The preview seam renders files that already exist; the image/PPT-producing tools are future work.
- **PPT thumbnails depend on the host.** `soffice` + `pdftoppm` must be present; otherwise the preview degrades to the original file (download link).
- **Test-infrastructure flakiness is unrelated.** Large parallel runs intermittently trip inspector worker timeouts, a `file-reference-local` race, and marginal coverage on unrelated files; `dsh-ci-test-reliability` addresses it.
- **Headless browser E2E is environment-limited.** The full render path needs a workspace-built instance and a real model turn; headless driving is blocked by the directory picker and modal instability.
