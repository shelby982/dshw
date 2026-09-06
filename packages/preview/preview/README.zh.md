---
description: "Preview contract for produced-file attachments: the tool-result meta payload and pure readers shared by session authorization and the browser renderer."
kind: "package-reference"
---

# @deepseek-ai/dsh-preview

[English](README.md) | 中文

## 摘要

本包执掌 preview seam 的 Definition 角色：描述产出文件被登记为可预览附件的持久契约。产出文件工具（一次写入、一次图像渲染、一次幻灯片构建）把输出字节存入内容寻址附件存储，再把结果的 `FileAttachmentRef` 记入工具结果的私有 `meta` 载荷。本包定义该载荷形状（`previews`）以及会话授权层与浏览器渲染器用来将它窄化出来的纯读取函数。

它不携带任何渲染逻辑，也没有服务实例：具体预览处理在 `@deepseek-ai/dsh-preview-local`，浏览器呈现则在 `ui-preview` client 模块。只在这里保留契约，能让产出文件工具、会话日志、浏览器渲染器在不耦合任何 provider 的前提下对齐同一个形状。

## 目录

- [使用本包](#use-this-package)
- [了解契约](#know-the-contract)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

产出文件工具 import `previewKindOf` 来从媒体类型推断渲染提示，并构建它记在工具结果上的 `previews` 载荷。会话授权层与 `ui-preview` 渲染器在重放的工具结果 `meta` 上调用 `previewsFromMeta` 以恢复产出文件。

````ts
import { previewKindOf, previewsFromMeta } from '@deepseek-ai/dsh-preview'
````

<a id="know-the-contract"></a>
## 了解契约

- `ProducedPreview` 把持久化 `FileAttachmentRef` 与可选渲染提示（`kind`）配对。
- `ProducedPreviewMeta` 是工具结果的 `meta` 载荷：`{ previews: ProducedPreview[] }`。它可 JSON 序列化，并位于（而非替代）工具自身的展示元数据（如 diff）旁边。
- `previewsFromMeta` 把不透明的 `meta` 窄化为产出预览；载荷缺失或畸形时返回 `undefined`，因此畸形或历史结果会失败关闭而非渲染幽灵。
- `previewKindOf(mediaType)` 把 MIME 类型映射到 `PreviewKind`。

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- 目前**尚无消费端**：没有任何产出文件工具记录 `previews`，会话授权或渲染器也没有读它。该契约是 `preview-local`、`tool-preview`、`ui-preview` 各组件构建的地基。
- 这里不设准入限制或字节上限；生产工具控制它附加的字节。
- PPT 转图片（`pptx` 预览）未在此实现；未来的 `preview-local` provider 拥有该能力，并在缺少转换栈时降级为"打开原文件"。
