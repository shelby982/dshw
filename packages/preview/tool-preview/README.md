---
description: "Model-facing preview_files tool: registers produced files as previewable Web attachments."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-preview

English | [中文](README.zh.md)

## Summary

This package provides the `preview_files` tool, the model-facing entry point of the produced-file preview seam. When the model produces files (images, HTML, slides, documents) the user wants to preview in-app, it calls `preview_files` with those paths. The tool reads each file from the session workspace, stores the bytes in the content-addressed `ctx.fileAttachments` service, and records the durable attachment references as the tool result's private `previews` metadata — so the browser renderer can rebuild a preview from the session log without any model-visible content carrying the file digest.

The tool surfaces only a count to the model (`Registered N produced file(s) for in-app preview.`); the attachment references ride the result metadata, never the model-facing content.

## Table of Contents

- [Use this package](#use-this-package)
- [Know the contract](#know-the-contract)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin and the tool is available to the model:

```yaml
- name: '@deepseek-ai/dsh-tool-preview'
```

The default composition already mounts it alongside `@deepseek-ai/dsh-attachment-local/file-attachments`. `maxPreviewBytes` caps the bytes read for one produced file.

<a id="know-the-contract"></a>
## Know the contract

- Each produced file is read from the session workspace (`exec.agent.session.header.cwd`) and stored via `ctx.fileAttachments.saveFile`, producing a durable content-addressed reference.
- The references are recorded in the tool result's `previews` metadata (keys of `tool/result`), which the `previewFile` session RPC authorizes and a browser renderer rebuilds from.
- Only the count reaches the model; attachment bytes and digests never enter model-visible content.

<a id="model-experience"></a>
## Model Experience

### preview_files tool

#### What the model sees

The `preview_files(files)` tool. The model names the produced files it wants registered; each is read from the session workspace, stored via `ctx.fileAttachments.saveFile`, and recorded in the tool result's `previews` meta. The tool's own description is what reaches the model; the attachment bytes and digests never enter model-visible content.

##### preview_files description

```markdown
Register produced files (images, HTML, slides, documents) so the user can preview their rendered content in the Web GUI.
```

#### Token effect

The tool schema and one tool call per registration batch. The tool ships a small, fixed description; `previews` meta is tool-private and not model-visible.

#### KV Cache effect

The tool schema enters the prompt prefix once per session. The result-time `previews` meta is logged but does not feed back into the prompt, so it does not churn the KV cache.

## Known Limitations and Deferred Work

- No browser renderer consumes the `previews` metadata yet (`ui-preview` is the pending piece); until then the tool records references that only the `previewFile` RPC can read back.
- The tool registers files the model explicitly names; automatic registration of every produced file (without a model call) is not implemented.
- Byte reads are capped by `maxPreviewBytes`; a file larger than the cap fails that entry rather than truncating.
