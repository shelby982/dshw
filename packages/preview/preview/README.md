---
description: "Preview contract for produced-file attachments: the tool-result meta payload and pure readers shared by session authorization and the browser renderer."
kind: "package-reference"
---

# @deepseek-ai/dsh-preview

English | [中文](README.zh.md)

## Summary

This package owns the Definition role of the preview seam: the durable contract describing produced files registered as previewable attachments. A produced-file tool (a write, an image render, a slide build) stores its output bytes in the content-addressed attachment store, then records the resulting `FileAttachmentRef` in the tool result's private `meta` payload. This package defines that payload shape (`previews`) and the pure readers both the session authorization layer and the browser renderer use to narrow it back out.

It carries no rendering logic and no service instance: concrete preview processing lives in `@deepseek-ai/dsh-preview-local`, and the browser presentation in the `ui-preview` client module. Keeping only the contract here lets a produced-file tool, the session log, and a browser renderer agree on one shape without coupling to any provider.

## Table of Contents

- [Use this package](#use-this-package)
- [Know the contract](#know-the-contract)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

A produced-file tool imports `previewKindOf` to infer the rendering hint from a media type, and builds the `previews` payload it records on the tool result. The session authorization layer and the `ui-preview` renderer call `previewsFromMeta` on the replayed tool-result `meta` to recover the produced files.

````ts
import { previewKindOf, previewsFromMeta } from '@deepseek-ai/dsh-preview'
````

<a id="know-the-contract"></a>
## Know the contract

- `ProducedPreview` pairs a durable `FileAttachmentRef` with an optional rendering hint (`kind`).
- `ProducedPreviewMeta` is the tool-result `meta` payload: `{ previews: ProducedPreview[] }`. It is JSON-serializable and sits beside (not instead of) the tool's own presentation metadata such as a diff.
- `previewsFromMeta` narrows opaque `meta` to produced previews; it returns `undefined` when the payload is absent or malformed, so a malformed or legacy result fails closed instead of rendering a ghost.
- `previewKindOf(mediaType)` maps a MIME type to a `PreviewKind`.

<a id="model-experience"></a>
## Model Experience

None, as this package is the durable preview contract whose model-facing effect belongs to the produced-file tool and the browser renderer.

#### KV Cache effect

No direct effect; the produced-file tool and the `previewFile` RPC own any model-visible behavior the contract records.

## Known Limitations and Deferred Work

- There is currently **no consumer**: no produced-file tool yet records `previews`, and no session authorization or renderer reads it yet. The contract is the foundation the `preview-local`, `tool-preview`, and `ui-preview` pieces build on.
- No admission limit or byte cap is imposed here; a producer controls the bytes it attaches.
- PPT-to-image conversion (a `pptx` preview) is not implemented here; a future `preview-local` provider owns that and degrades to "open the original file" when the conversion stack is absent.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
