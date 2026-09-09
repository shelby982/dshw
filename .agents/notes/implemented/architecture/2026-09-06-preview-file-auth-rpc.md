# Agent Note: Produced-file preview contract and previewFile authorization RPC

Status: implemented

English | [中文](2026-09-06-preview-file-auth-rpc.zh.md)

## Problem

Durable image attachment is a complete seam: content-addressed objects, session-log reference authorization (`referencedImage`→`readImage`), and a browser Blob-URL render path that rebuilds across refreshes. Produced **non-image** files (PPTX, HTML, documents) had no equivalent: they existed only as workspace paths surfaced by `ui-deliverables` and opened in the host OS (`openWorkspacePath` → `openNativePath`). That made in-GUI preview impossible for anything except images, and the `workspacePathOpen` capability that gated the OS opener lived in a module-level probe that reset on every page refresh.

## Decision

Extend the produced-file path in three layers, reusing the attachment seam rather than widening it:

1. **Storage** — `FileAttachmentStore` (`ctx.fileAttachments`), a sibling of the image `AttachmentStore`, reusing the shared content-addressed `publishObject`/`readObject` object layer ([storage note](2026-09-04-parallel-general-file-attachment-store.md)).
2. **Contract** — `@deepseek-ai/dsh-preview` defines the tool-result `meta` payload shape (`previews: ProducedPreview[]`) and the pure readers `previewsFromMeta`/`previewKindOf`. A produced-file tool records the durable `FileAttachmentRef` of each previewable output there; `meta` is the tool's private, already-established presentation payload (`FsDiffMeta` precedent) and is persisted with the session log but is **not** model-visible.
3. **Authorization RPC** — `sessionController.previewFile` (`@Remote('previewFile')`), a sibling of the image `attachment` RPC. It finds a `FileAttachmentRef` recorded in any tool result's `previews` metadata (`referencedFile`), reads the object through `ctx.fileAttachments.readFile`, and returns base64 bytes. On the client, the session `readPreviewFile` verb exposes it; `SessionPreviewFileRequest`/`SessionPreviewFileValue` ride the session wire namespace.

`meta` placement is deliberate: it keeps the attachment reference out of model-visible content (so a produced file's digest never inflates a model request), while remaining reconstructable from the session log — the "model-visible ⟺ logged" rule holds for the UI side because the renderer rebuilds the card from persisted `meta`.

## Alternatives considered

- **Widen the existing `attachment` RPC to a union of image/file refs**: one seam, but tears the client surface — `ui-attachment`/`HistoricalImageCache` assume an `ImageAttachmentRef`, and every `ISession` fixture (`fake-api`, `test-support` session, `ui-conversation` mock) and the generated `api-catalog` would need the union. Ruled out in favor of a parallel `previewFile` RPC (blast radius confined to the new verb's contract).
- **A dedicated session event carrying the file ref**: most explicit "logged" signal, but bumps `SESSION_FORMAT_VERSION` and widens the event schema for what `tool/result`'s existing `meta` already carries. Ruled out.
- **Carry the file ref in a tool-result content block**: simplest for the reader, but puts attachment references into model-visible content (a PPTX digest riding the transcript and every snapshot). Ruled out.

## Consequences

- The image `attachment` RPC, `ui-attachment`, and `HistoricalImageCache` are untouched; the `previewFile` verb is additive.
- The whole produced-file path is storage + contract + authorization only for now: no tool yet records `previews`, and no browser renderer consumes them. `dsh-preview` is a real contract package, but its producer/consumer lie ahead.
- `gen-cordis-api` required classifying the new types: `FileAttachmentRef`/`StoredFileAttachment`/`SaveFileAttachment` (attachment-owned), `SessionPreviewFileRequest`/`SessionPreviewFileValue` (session wire), and mapping the `fileAttachments` service to the `attachment` subsystem page.
- Authorization fails closed: a `previews` payload absent or malformed yields `ATTACHMENT_NOT_REFERENCED`, and read failures map to the attachment-invalid or internal remote codes.
- `ctx.fileAttachments` is mounted in the base composition via the `@deepseek-ai/dsh-attachment-local/file-attachments` subpath plugin (a separate row from the image `attachment-local`), so the `previewFile` RPC and any produced-file tool have a live service.
- The `preview_files` tool (`@deepseek-ai/dsh-tool-preview`, mounted in the base composition) is the model-facing registrant: it reads produced files from the session workspace, stores them via `ctx.fileAttachments.saveFile`, and records the `previews` metadata (only the count reaches the model; the digest never enters model-visible content).
