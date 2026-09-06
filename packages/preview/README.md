---
description: "Produced-file preview subsystem: the durable preview contract and the model-facing preview_files tool, both built on the attachment seam."
kind: "package-group"
---

# preview/ — produced-file preview

English | [中文](README.zh.md)

## Summary

The `preview/` group is the produced-file preview seam: it owns the durable contract between a produced-file tool and the browser renderer, and the model-facing tool that registers files for preview. The contract reuses the general-file attachment store (`ctx.fileAttachments`) rather than widening the image-only attachment path; a produced file is stored as a content-addressed object and referenced by a durable `FileAttachmentRef`, which the session authorization RPC reads back and the browser renderer consumes. The subsystem lives on the [attachment seam](../../docs/subsystems/attachment.md) — see that page for the content-addressed object layer both share.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)

-----

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`preview/`](preview/README.md) | `@deepseek-ai/dsh-preview` — the tool-result `previews` meta payload and the pure readers `previewsFromMeta` / `previewKindOf`. |
| [`tool-preview/`](tool-preview/README.md) | `@deepseek-ai/dsh-tool-preview` — the model-facing `preview_files` tool that registers produced files as durable preview references. |

-----

<a id="related-documentation"></a>
## Related documentation

- [Attachment subsystem](../../docs/subsystems/attachment.md) — the content-addressed object layer and general-file store the preview seam reuses.
- [Session reference authorization](../../docs/subsystems/session.md) — how the `previewFile` RPC authorizes a recorded reference back to the session that produced it.
