# Agent Note: Split the composer editor surface out of the input domain

Status: implemented

English | [中文](2026-09-09-ui-conversation-skeleton-editor-domain-layering.zh.md)

## Problem

`verify-client-domain-graph` enforces per-directory layering inside `packages/client/*/src/client/`: layer 0 `contract/` is importable by all, layer 1 domains (`skeleton`, `input`, `conversation`, …) may import `contract/` and never each other, and only `apply.ts`/`index.ts` assemble across domains. The gate reported three violations, all one edge: `skeleton/InputBar.tsx` imported `../input/editor/{ComposerContentEditable.tsx, DecoratorPortals.tsx, keymap.ts}`.

`input/editor/` mixed two concerns: the editor **model augmentations** (`chip-node`, `claim-decor`, `text-ref`, `projection`, `span-map`, `ReferenceChip`) consumed by `input/facade.ts`, and the editor **surface binders** (`ComposerContentEditable`, `DecoratorPortals`, `registerComposerKeymap`) consumed only by the `skeleton` composer bar. The bar lived in `skeleton` but its text-surface binder sat in `input` — an inverted edge the layer gate correctly refused.

## Decision

Keep `input` = the input machine plus its editor model augmentations; move the three self-contained surface binders into a new `skeleton/editor/`. `skeleton` already owns the composer bar and its presentation accessories (`ContextMeter`, `PermissionSelect`), so the bar's text-surface binder belongs with it. The move is safe because the three binders are self-contained — they import only `react`/`react-dom`/`lexical`/`@lexical/utils` and `contract/input.ts` (the `ArbitrateKey`/`ArbitrateOutcome` types), never an `input`-domain file or an `input/editor` sibling. `input/facade.ts` continues to consume the model-augmentation files, which stay in place.

Within-domain subfolders are fine: `domainOf` reads only the first path segment, so `skeleton/editor/*` is `skeleton`, and `InputBar` → `./editor/*` is a same-domain import. `keymap.ts`'s `../../contract/input.ts` remains a contract-layer import.

## Alternatives considered

- **Move the whole composer bar (`InputBar` + `ContextMeter` + `PermissionSelect` + binders) into `input`**: larger blast radius (six files plus CSS and the `apply.ts` import) and contradicts the layout the bar already has — its presentation accessories are in `skeleton`, so the bar is a `skeleton` concern and `input` stays the machine.
- **Expose the editor surface from `input` through a slot**: over-engineering for three files with a single consumer; a new slot and a rewritten consumer would buy decoupling nothing here needs.
- **Flatten the binders to the client root**: mixes implementation into the assembly/root layer (`apply.ts`/`service.ts`/`stores.ts`) and lowers cohesion by separating the bar from its own surface.

## Consequences

- `verify-client-domain-graph` drops from 3 violations to 0. The move is behavior-neutral (pure relocation), so no keyless snapshot updates; the moved files stay 100% covered (the same tests exercise them through new import paths, and `keymap-routing` imports `registerComposerKeymap` from the new path).
- The same change-set also completed the preview feature's outstanding gate debt so a single green branch could be submitted: registered `tool-preview` in the tool-schema boot manifest (regenerated the en + zh `docs/tool-catalog.md`), fixed `no-unnecessary-type-assertion`/`unbound-method`/`no-confusing-void-expression` lint in `tool-preview` and `ui-preview`, and brought the feature's package READMEs under the doc-standard skeleton (`## 概述`/`## 目录`/`## 开发备注` / `## Dev Note`).
