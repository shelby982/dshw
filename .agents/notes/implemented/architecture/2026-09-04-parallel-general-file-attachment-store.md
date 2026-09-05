# Agent Note: Parallel general-file attachment store (FileAttachmentStore)

Status: implemented

English | [中文](2026-09-04-parallel-general-file-attachment-store.zh.md)

## Problem

Durable image attachment is a mature seam: content-addressed objects under `DSH_HOME/attachments/v1`, session-log reference authorization (`referencedImage`), and a browser Blob-URL render path that rebuilds across refreshes. But it is **image-only** — `AttachmentStore` (`ctx.attachments`) exposes `ImageAttachmentRef`/`saveImage`/`readImage` and everything downstream (admission, normalization, `ImageAttachmentLimits`) is raster-specific. Produced non-image files (PPTX, HTML, documents) have no durable, session-authorized storage: they are only workspace paths surfaced as chips by `ui-deliverables` and opened in the host OS.

Extending the shipped `AttachmentStore` with general-file methods was the surface-level fix, but it is abstract and its members are implemented by many test subclasses (`RecordingStore`, `E2eAttachmentStore`, `StaticAttachmentStore`, `JpegOnlyStore`, …) across several packages. Adding a new **abstract** member forces every subclass to implement it — a large, unrelated breakage surface for a storage preview-ability gain.

## Decision

Add a **parallel** general-file attachment seam that reuses the content-addressed object layer instead of widening `AttachmentStore`:

1. In the `@deepseek-ai/dsh-attachment` Definition package, add `FileAttachmentStore` (`ctx.fileAttachments`), a sibling of `AttachmentStore`, with `saveFile`/`readFile`/`fileHostPath` and the new `FileAttachmentRef`/`SaveFileAttachment`/`StoredFileAttachment` vocabulary. Existing `AttachmentStore` and every `extends AttachmentStore` subclass are untouched.
2. In `attachment-local`, extract the byte-object machinery already inside `commitPreparedImageFile`/`readImageFile` into shared `publishObject`/`readObject` (content-addressed write + fsync + hardlink dedupe + digest verify), then add `prepareFileObject`/`commitFileObject`/`readFileObject`/`fileObjectPath` on top. `LocalFileAttachmentStore` implements the new seam by calling them.
3. The image-specific steps stay where they are: admission, normalization, probe, and request projection never touch the general-file path.

The design keeps `ctx.attachments` (image) and `ctx.fileAttachments` (general file) symmetric — both content-addressed, both `sha256:`-keyed under the same `objects/<2>/<sha256>` tree, both read back with digest verification — while leaving the shipped raster behavior and its tests untouched.

## Alternatives considered

- **Add abstract general-file methods to the existing `AttachmentStore`**: one seam, but forces `saveFile`/`readFile` onto every `extends AttachmentStore` subclass (a dozen-plus across `attachment`, `llm-*`, `fs/tool-fs`, `mcp-client`, `api/session-controller` tests) and turns a preview-ability change into a broad compile-time breakage. Ruled out.
- **Copy the byte-publish/read logic into new general-file functions**: avoids touching the image path but duplicates ~40 lines of content-addressed publication. Ruled out in favor of the shared `publishObject`/`readObject` extraction, which both paths now exercise.
- **A separate new package for general-file storage**: more isolation, but no current consumer needs a distinct package boundary; the attachment seam is the natural home. Deferred until a Consumer forces it.

## Consequences

- `AttachmentStore` and its subclasses are unchanged; existing `attachment`/`attachment-local` tests pass and the two packages hold 100% per-file coverage.
- The general-file path is storage-only for now: no admission limit, no session-log registration, no authorization, no renderer. It is a foundation the preview seam will build on. The `attachment` README's "non-image files are not supported yet" limitation stays true end-to-end until a consumer registers files and proves them.
- `publishObject`/`readObject` are now exercised by both image and general-file reads, so the object layer's error branches (missing object, corrupted bytes, dedupe race) are covered from two call sites.
