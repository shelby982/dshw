---
description: "Model-facing preview_files tool: registers produced files as previewable Web attachments."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-preview

[English](README.md) | 中文

## 摘要

本包提供 `preview_files` 工具，作为产出文件预览 seam 的模型入口。当模型产出用户希望在应用内预览的文件（图片、HTML、幻灯片、文档）时，它调用 `preview_files` 并带上这些路径。工具从会话工作区读取每个文件，把字节存入内容寻址的 `ctx.fileAttachments` 服务，并把持久化附件引用记录为工具结果的私有 `previews` 元数据——因此浏览器渲染器无需任何模型可见内容携带文件摘要，也能从会话日志重建预览。

工具只向模型呈现一个计数（`Registered N produced file(s) for in-app preview.`）；附件引用走结果元数据，绝不进入模型可见内容。

## 目录

- [使用本包](#use-this-package)
- [了解契约](#know-the-contract)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

挂载该插件后工具即可供模型使用：

```yaml
- name: '@deepseek-ai/dsh-tool-preview'
```

默认 composition 已把它与 `@deepseek-ai/dsh-attachment-local/file-attachments` 一起挂载。`maxPreviewBytes` 限制单个产出文件读取的字节数。

<a id="know-the-contract"></a>
## 了解契约

- 每个产出文件从会话工作区（`exec.agent.session.header.cwd`）读取，经 `ctx.fileAttachments.saveFile` 存储，产出持久化内容寻址引用。
- 引用记录在工具结果的 `previews` 元数据（`tool/result` 的键）中，由 `previewFile` 会话 RPC 鉴权，并供浏览器渲染器重建。
- 只有计数到达模型；附件字节与摘要从不进入模型可见内容。

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- 尚无浏览器渲染器消费 `previews` 元数据（`ui-preview` 是待办部分）；在此之前工具记录下的引用只能由 `previewFile` RPC 读回。
- 工具登记的是模型显式指定的文件；自动登记每个产出文件（无需模型调用）未实现。
- 字节读取受 `maxPreviewBytes` 上限约束；超过上限的文件会让该条目失败而非截断。
