# Agent Note: 把 composer 编辑器表面绑定拆出 input 域

Status: implemented

[English](2026-09-09-ui-conversation-skeleton-editor-domain-layering.md) | 中文

## 问题

`verify-client-domain-graph` 强制 `packages/client/*/src/client/` 内的按目录分层：层 0 `contract/` 人人可 import，层 1 各域（`skeleton`、`input`、`conversation`、……）只能 import `contract/` 与自己域、严禁互相 import，只有 `apply.ts`/`index.ts` 能跨域装配。该门禁报出 3 处违规，都是同一条边：`skeleton/InputBar.tsx` import 了 `../input/editor/{ComposerContentEditable.tsx, DecoratorPortals.tsx, keymap.ts}`。

`input/editor/` 混了两件事：被 `input/facade.ts` 消费的编辑器**模型增强**（`chip-node`、`claim-decor`、`text-ref`、`projection`、`span-map`、`ReferenceChip`），以及被 `skeleton` composer 条独占消费的编辑器**表面绑定**（`ComposerContentEditable`、`DecoratorPortals`、`registerComposerKeymap`）。条住在 `skeleton`，但它的文本表面绑定却放在 `input` —— 一条被层门禁正确拒绝的反向边。

## 决策

保持 `input` = 输入机及其编辑器模型增强；把 3 个自包含的表面绑定移入新的 `skeleton/editor/`。`skeleton` 本就拥有 composer 条及其展示配件（`ContextMeter`、`PermissionSelect`），所以条的文本表面绑定随之归属 `skeleton`。这次移动是安全的：3 个绑定完全自包含 —— 只 import `react`/`react-dom`/`lexical`/`@lexical/utils` 与 `contract/input.ts`（`ArbitrateKey`/`ArbitrateOutcome` 类型），从不 import 任何 input 域文件或 `input/editor` 兄弟文件。`input/facade.ts` 继续消费留在原位的模型增强文件。

域内子目录无碍：`domainOf` 只取首段路径，因此 `skeleton/editor/*` 是 `skeleton`，`InputBar` → `./editor/*` 是同域 import。`keymap.ts` 的 `../../contract/input.ts` 仍是契约层 import。

## 备选方案

- **把整个 composer 条（`InputBar` + `ContextMeter` + `PermissionSelect` + 绑定）挪进 `input`**：改动面更大（6+ 文件及 CSS 与 `apply.ts` import），并且与条已有的布局相悖 —— 它的展示配件在 `skeleton`，所以条属于 `skeleton`，`input` 保持为机器。
- **让 `input` 经 slot 暴露编辑器表面**：对 3 个单消费方文件是过度设计；新增 slot 并重写消费端买不到这里需要的解耦。
- **把绑定平铺到 client 根**：把实现混进装配/根层（`apply.ts`/`service.ts`/`stores.ts`），并通过把条与其自身表面分离来降低凝聚力。

## 后果

- `verify-client-domain-graph` 从 3 处违规降到 0。移动不改变行为（纯搬移），因此不触发 keyless snapshot 更新；被移动的文件仍 100% 覆盖（同一批测试经由新 import 路径练习它们，`keymap-routing` 从新路径 import `registerComposerKeymap`）。
- 同一改动集也补齐了 preview feature 的遗留门禁债，以便提交一个全绿分支：把 `tool-preview` 登记进工具 schema 启动 manifest（重新生成了 en + zh 的 `docs/tool-catalog.md`），修掉 `tool-preview` 与 `ui-preview` 的 `no-unnecessary-type-assertion`/`unbound-method`/`no-confusing-void-expression` lint 错误，并把 feature 各包 README 纳入 doc-standard 骨架（`## 概述`/`## 目录`/`## 开发备注` / `## Dev Note`）。
