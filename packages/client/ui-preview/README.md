---
description: "Produced-file previews in the Web GUI: the preview row a finished turn ends with, listing the image, page, slides, text, and JSON files the tools produced; for users and maintainers of the preview experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-preview

English | [中文](README.zh.md)

## Summary

This package renders the preview row a finished turn ends with — the produced files a tool registered as previewable, each loaded from its durable preview bytes and rendered in the browser. The vocabulary comes from the `previews` meta a produced-file tool attaches to its own `tool/result`, never from the closing prose — a produced file is listed whether or not the model remembered to name it. The shipped Web patch is the only composition that loads this package; removing its cordis.yml entry removes the row and leaves the turn-tail chain empty at zero cost.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin alongside `ui-conversation`; a finished turn then ends with the produced-preview row between the closing message's body and its action footer. Each entry loads its durable bytes through the session-authorized `previewFile` RPC and renders the content by kind: `Image` previews show the image, `Page` previews render the HTML in a sandboxed iframe, `Text` and `JSON` previews decode the bytes (JSON pretty-printed), and `Slides` and other types offer a downloadable link. The row keyed the durable attachments; a preview object in the list is loaded lazily on mount and cached per Session.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Node half is a no-op. The browser half registers `PreviewFiles` into the chat view's `conversation.chat.turnTail` hole. `previewDefinition` folds each Turn's produced previews into `PreviewTurnData` from the `previews` meta on successful, append-surface `tool/result` events. Reads, unsupported tools, malformed calls, failed results, and replacement surface ops contribute nothing. Attachments are content-addressed, so the same bytes produced twice in a turn render once, on the order of first appearance. `PreviewFileCache` resolves each durable `FileAttachmentRef` to a browser URL (blob, or a data-URL fallback) through `session.readPreviewFile`, caching per Session and releasing URLs on Session-scope teardown. The row reads its entries through `owner.turn.data`, the same Location-index store the chat view projects. Composing the plugin out removes the row and leaves the tail hole empty.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the preview surface is not enough.

- [Preview contract](../../preview/preview/README.md) — owns the `produced-preview` meta payload the row reads.
- [Preview file RPC](../../api/session-controller/README.md) — the session-authorized bytes behind each preview reference.
- [ui-conversation](../ui-conversation/README.md) — declares the `conversation.chat.turnTail` hole and renders the closing prose.
- [Client package map](../README.md) — adjacent browser UI packages.

-----

<a id="model-experience"></a>
## Model Experience

### Produced-file preview row

#### What the model sees

Nothing new. The preview vocabulary enters the transcript through the produced-file tool's own `previews` result meta; the row adds no prompt section, no tool schema, and no model-visible context.

#### Token effect

None — this package contributes no prompt text or tool surface.

#### KV Cache effect

None — the prompt prefix is unchanged by this package.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the current preview surface. They are current package constraints, not a general file-preview comparison or a task backlog.

- **PPT thumbnails are environment-dependent** — the host must offer a LibreOffice and poppler conversion pipeline; until then the row renders `Slides` previews as a downloadable link rather than image thumbnails.
- **Non-previewable media types fall back to download** — the row renders a kind outside `image`/`html`/`text`/`json` as a downloadable file link, so an unknown produced file is still reachable.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The slot, dictionary, event definition, and client registrations are effect-owned with disposal proven by the plugin spec; this package owns no mutable state.
