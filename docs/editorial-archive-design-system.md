# Editorial Archive Design System

Status: implemented foundation July 2026
Depends on: [product-contract.md](./product-contract.md)

## Direction

OpenFolio is an **Editorial Archive**: a dark graphite Mac shell presenting warm paper records. The interface is 90% monochrome and 10% controlled person/data color. Oxidized teal indicates interaction without reading as electric or purple. The user's message history supplies the expressive color and texture.

It should feel sophisticated enough for private data and human enough for personal history. It must not look like an iMessage clone, CRM, generic dashboard, developer console, luxury-fashion site, or scrapbook.

## Token contract

All app and website components consume semantic tokens. Raw palette values belong only in `packages/shared-tokens/tokens.css`. Page components must not introduce one-off hex values.

### Primitive color palette

| Token | Value | Role |
| --- | --- | --- |
| `ink` | `#0B0B0B` | deepest shell and graphic black |
| `carbon` | `#151515` | sidebar and dark card |
| `graphite` | `#292927` | elevated dark surface |
| `ash` | `#686864` | secondary dark metadata |
| `mist` | `#D9D7D1` | rules and disabled structure |
| `paper` | `#F3F1EB` | primary light canvas |
| `chalk` | `#FAF9F6` | elevated paper surface |
| `paper-ink` | `#141412` | primary text on paper |
| `shell-ink` | `#F5F4F0` | primary text on dark shell |
| `interaction-accent` | `#36575A` | primary interaction |
| `interaction-accent-hover` | `#294548` | hover/pressed interaction |
| `interaction-accent-soft` | `#DFE8E5` | selected surface on paper |
| `critical` | `#9B353D` | destructive/error |
| `critical-soft` | `#F3E3E3` | error background |
| `success` | `#56715B` | verified local-ready state |
| `success-soft` | `#E4EAE3` | success background |
| `warning` | `#9A6A27` | blocked/partial state |
| `warning-soft` | `#F0E7D7` | warning background |

Relationship/data colors:

| Token | Value |
| --- | --- |
| `person-lilac` | `#A999E8` |
| `person-rose` | `#C88791` |
| `person-moss` | `#7D947C` |
| `person-amber` | `#C89A55` |
| `person-slate` | `#7389A9` |
| `person-clay` | `#B77759` |

Person colors are assigned deterministically from the canonical person ID, not display name, so identity color survives renaming. They appear in avatars, a 2px dossier marker, selected data series, and Wrapped. Never color an entire standard page by person.

### Semantic light-canvas tokens

| Semantic token | Maps to |
| --- | --- |
| `background` | `paper` |
| `foreground` | `paper-ink` |
| `card` | `chalk` |
| `card-foreground` | `paper-ink` |
| `muted` | `#E9E6DE` |
| `muted-foreground` | `#686760` |
| `border` | `rgba(20,20,18,0.13)` |
| `input` | `rgba(20,20,18,0.18)` |
| `primary` | `interaction-accent` |
| `primary-foreground` | `#FFFFFF` |
| `secondary` | `#EAE7E0` |
| `secondary-foreground` | `paper-ink` |
| `accent` | `interaction-accent-soft` |
| `accent-foreground` | `#243F42` |
| `ring` | `interaction-accent` |
| `destructive` | `critical` |

### Semantic dark-canvas tokens

The sidebar remains dark in every mode. Dark appearance converts the content canvas rather than inverting every primitive.

| Semantic token | Maps to |
| --- | --- |
| `background` | `carbon` |
| `foreground` | `shell-ink` |
| `card` | `#1D1D1B` |
| `card-foreground` | `shell-ink` |
| `muted` | `graphite` |
| `muted-foreground` | `#A7A59F` |
| `border` | `rgba(255,255,255,0.12)` |
| `input` | `rgba(255,255,255,0.18)` |
| `primary` | `#6F9192` |
| `primary-foreground` | `#0B0B0B` |
| `secondary` | `graphite` |
| `secondary-foreground` | `shell-ink` |
| `accent` | `#243B3D` |
| `accent-foreground` | `#CFE0DE` |
| `ring` | `#8AA4A4` |
| `destructive` | `#DC6B72` |

Sidebar tokens are fixed: background `ink`, foreground `shell-ink`, muted foreground `#A3A19B`, border `rgba(255,255,255,0.12)`, selected background `rgba(255,255,255,0.09)`, and selected marker `interaction-accent`.

Shared component aliases:

| Semantic token | Light canvas | Dark canvas |
| --- | --- | --- |
| `popover` | `chalk` | `#1D1D1B` |
| `popover-foreground` | `paper-ink` | `shell-ink` |
| `overlay` | `rgba(11,11,11,0.42)` | `rgba(0,0,0,0.64)` |
| `selection` | `interaction-accent-soft` | `#243B3D` |
| `selection-foreground` | `#243F42` | `#CFE0DE` |
| `sidebar-background` | `ink` | `ink` |
| `sidebar-foreground` | `shell-ink` | `shell-ink` |
| `sidebar-primary` | `interaction-accent` | `#6F9192` |
| `sidebar-primary-foreground` | `#FFFFFF` | `ink` |
| `sidebar-accent` | `rgba(255,255,255,0.09)` | same |
| `sidebar-accent-foreground` | `shell-ink` | same |
| `sidebar-border` | `rgba(255,255,255,0.12)` | same |
| `sidebar-ring` | `#8AA4A4` | same |
| `chart-1…6` | person lilac, rose, moss, amber, slate, clay | same primitives, used on dark canvas |

Native text selection uses `selection`; the cited-result marker still uses the stronger `primary`. Status surfaces map to the explicit critical/success/warning pairs rather than overloading relationship colors.

### Typography

- Display/editorial: the system-local serif stack `ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`.
- Product UI: the system-local stack `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`.
- System truth: the system-local stack `"SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace`.
- No font may load from a remote CDN. A named product font may replace a stack only after its files are checked into the product and covered by the release artifact checks.

Roles:

| Role | Size / line | Weight | Face |
| --- | --- | --- | --- |
| Display XL | 64 / 64 | 400 | serif |
| Display L | 48 / 52 | 400 | serif |
| Page title | 32 / 36 | 400 | serif |
| Story title | 24 / 28 | 400 | serif |
| UI title | 20 / 24 | 600 | sans |
| Section | 14 / 20 | 600 | sans |
| Body | 14 / 20 | 400 | sans |
| Compact body | 13 / 20 | 400 | sans |
| Label | 12 / 16 | 600 | sans |
| Metadata | 11 / 16 | 450 | sans |
| Mono metadata | 11 / 16 | 450 | mono |

Serif is reserved for brand, Search opening statement, dossier title, Wrapped storytelling, and large statistics. It never labels controls, filters, settings rows, or dense lists. Mono is limited to timestamps, years, versions, paths, counts in progress displays, and diagnostics.

### Spacing and layout

Base unit: 4px. The shared scale is `space-1…12` = `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px`. Components use these tokens rather than one-off spacing values.

- Sidebar: 232px expanded, 56px compact.
- List pane: 320px default; 280px minimum; 360px maximum.
- Main content max width: 1180px.
- Reading column: 680px maximum.
- Desktop canvas padding: 40px.
- Compact canvas padding: 24px.
- Dense list row: 52–64px.
- Standard control height: 36px; compact: 28px; prominent search: 56px.
- 12-column desktop grid, 24px gutters; 8-column compact, 16px gutters.

### Shape, rules, elevation

Radii:

- hairline detail: 2px;
- controls: 4px;
- panels and message records: 6px;
- onboarding artifact only: 12px;
- full pill: only a status dot or a control whose semantics require a capsule;
- circle: avatars and icon-only controls only.

Use 1px rules for grouping. Standard cards have no shadow. Elevation tokens:

- `shadow-floating`: `0 12px 32px rgba(11,11,11,0.14)` for menus/popovers;
- `shadow-modal`: `0 24px 64px rgba(11,11,11,0.22)` for dialogs/sheets;
- `shadow-artifact`: `0 18px 50px rgba(11,11,11,0.12)` only when a Wrapped/export artifact is visibly presented above a surface.

Folio edges use at most two pseudo-layers, offset 2px and 4px. They cannot become generic stacked-card decoration.

### Motion

| Token | Duration | Use |
| --- | --- | --- |
| `motion-instant` | 80ms | press/selection response |
| `motion-fast` | 120ms | hover/focus color |
| `motion-base` | 180ms | pane/result transition |
| `motion-slow` | 240ms | dialog/sheet |
| `motion-story` | 420ms | Wrapped reveal only |

Use cubic bezier `(0.2, 0, 0, 1)` for entry and `(0.4, 0, 1, 1)` for exit. No default spring, bounce, parallax, looping background, or decorative cursor animation. Message-strata import motion may grow only as real progress changes.

Under `prefers-reduced-motion: reduce`, remove translation and sequencing; retain immediate opacity/state changes under 80ms.

### Layer order

Use component-managed overlay layers. Conceptual order: canvas 0, sticky header 10, sidebar 20, popover 40, dialog 50, toast 60, macOS drag region 70. Page code must not invent arbitrary z-index values.

## Signature motif: message strata

Message strata are thin bars derived from message counts over fixed time buckets.

- Each bar represents the same duration within one instance.
- Height or darkness represents count normalized within that instance.
- A gap means zero records, not missing data.
- Person strata use the assigned person color only for one selected layer; the rest remains monochrome.
- Global strata use monochrome with oxidized teal only for the selected interval.
- Always provide a text summary or accessible chart label. The motif is not the only carrier of data.
- Never describe it as audio, sentiment, heart rate, or relationship strength.
- Skeletons may imitate the geometry but cannot imply fake data.

## Component rules

The renderer is a Tailwind v4 shadcn project. Reuse existing primitives and add missing shadcn components before making bespoke equivalents. Styling flows through semantic tokens; `className` is for layout/spacing. Forms use accessible grouped field primitives. Dialogs and sheets always have titles. Avatars always have fallbacks.

### Shell and navigation

- Sidebar is graphite/ink, flat, and rule-separated.
- Active item uses a 2px interaction-accent left marker plus a subtle light surface. It is not a large colored pill.
- Icons are monochrome and 16px. Labels remain visible until compact mode.
- Local status uses text plus icon; color is never the only status indicator.

### Search field

- 56px high on pristine Search, 44px after results appear.
- Leading search icon, text input, clear action when non-empty, `⌘K` hint when empty.
- 1px border; interaction-accent focus ring; no outer shadow at rest.
- Submit on Enter. Search-as-you-type starts after 180ms, while Enter runs immediately.
- A loading spinner may replace the shortcut hint but must not shift layout.

### Buttons

- Primary: interaction-accent fill; one primary action per local region.
- Secondary: transparent/paper with border.
- Quiet: text/icon with transparent background.
- Destructive: critical color only after explicit destructive intent.
- Rectangular 4px radius; 36px default, 28px compact.
- Loading state preserves label width, uses spinner, and disables repeat activation.

### Filters and segmented controls

- 2–7 mutually exclusive options use a segmented/toggle group.
- Multi-select filters use a popover with checkboxes and a count.
- Applied values use removable chips.
- Never render a wall of individually toggled buttons.

### Results and citations

- Results are separated by rules, not floating cards.
- Selected result gets an interaction-accent marker and `interaction-accent-soft` surface.
- Snippet is at most three lines in the list; full context belongs in evidence preview.
- Matched text uses font weight plus a low-contrast interaction-accent background, never color alone.
- Citation metadata is compact sans or mono for timestamp.
- The `Open in conversation` action is always text-labeled.

### Person identity

- Avatar uses photo when locally available; fallback initials plus deterministic person color.
- Dossier header uses one person-color edge and message strata, not a full colorful gradient.
- Unknown contacts use handle-derived initials or `?` plus an explicit `Unknown contact` label.
- Identity editing occurs in a titled sheet or edit section, not permanent form fields.

### Conversation evidence

- Incoming and outgoing records differ through alignment, a subtle surface tone, and sender label in groups.
- Maximum message block width: 72% on wide panes, 88% compact.
- Message blocks have 6px corners, no bubble tails, and no bright blue fill.
- Date separators are horizontal rules with a centered date.
- The cited message gets a 2px interaction-accent outline and `Source match` label; surrounding messages remain visually quieter.
- Attachments use a document row with type icon, filename/type, and timestamp. Unsupported attachments are not shown as broken images.

### Cards, empty states, loading, and feedback

- Use full Card composition only for true artifacts or major grouped modules.
- Use separators/list rows for most settings, results, and data.
- Empty states use the shadcn Empty pattern, one quiet strata graphic at most, a concrete explanation, and one next action.
- Loading uses Skeleton for stable layouts and Spinner for indeterminate actions. No fake data values.
- Alerts explain blocked/partial local states. Toasts confirm completed actions; persistent problems stay inline.
- Status badges always include readable text (`Ready`, `Partial`, `Needs access`).

### Charts and Wrapped

- Axes, grids, and unselected data are gray.
- One active series uses oxidized teal; people use deterministic person colors.
- No gradients, glow, faux 3D, smoothed lines that obscure discrete truth, or default Recharts tooltips.
- Heatmap scale: paper → mist → graphite → ink; selected cell oxidized teal.
- Wrapped may use large serif type, asymmetry, cropping, and full-bleed strata, but every statistic remains labeled and deterministic.

## Page wireframes and content hierarchy

### Search, pristine

```text
┌──────────────┬──────────────────────────────────────────────────────────┐
│ OpenFolio    │                                                          │
│              │        OpenFolio remembers who told you what.            │
│ Search       │        [ Search your iMessage history…            ⌘K ]   │
│ People       │        the ramen place Jordan recommended                │
│ Conversations│        who told me about the red-eye to Tokyo            │
│ Wrapped      │                                                          │
│              │        Your messages and search index stay on this Mac.  │
│ On this Mac  │                                                          │
│ Settings     │                                                          │
└──────────────┴──────────────────────────────────────────────────────────┘
```

Hierarchy: statement → query → examples → privacy. No summary cards, recent searches, reminders, or relationship judgments.

### Search, results

```text
┌──────────────┬──────────────────────────────────────┬───────────────────┐
│ navigation   │ Search                               │ Evidence          │
│              │ [ ramen place Jordan…             ] │ Jordan · Dinner   │
│              │ Type  Person  Conversation  Date     │ Mar 14, 2024      │
│              │ 18 matches · local semantic ready   │                   │
│              │ ───────────────────────────────────  │ before context    │
│              │ Jordan Lee · Mar 14, 2024            │ MATCHED MESSAGE   │
│              │ “...try the place on Clement...”     │ after context     │
│              │ Related wording                      │                   │
│              │ ───────────────────────────────────  │ [Open conversation]│
│              │ next result                          │                   │
└──────────────┴──────────────────────────────────────┴───────────────────┘
```

Below 1180px, evidence opens as a titled Sheet. Below 760px, filters collapse into one `Filters` button and results use the full pane.

### People index and dossier

```text
┌──────────────┬───────────────────┬──────────────────────────────────────┐
│ navigation   │ People            │ SARAH KANG DOSSIER                   │
│              │ [Search people]   │ [avatar] Sarah Kang        [Edit]   │
│              │ Recent ▾          │ message strata                       │
│              │ ───────────────   │ 1,284 messages · Jun 2023–Jul 2026  │
│              │ Sarah Kang        │ ───────────────────────────────────  │
│              │ Jordan Lee        │ First / Last / Rhythm / Balance      │
│              │ Unknown contact   │ Conversations                        │
│              │                   │ [Search Sarah's messages…]           │
│              │                   │ Identity & aliases                   │
│              │                   │ Private notes (collapsed)            │
└──────────────┴───────────────────┴──────────────────────────────────────┘
```

Hierarchy: identity → evidence-based summary → conversations/search → identity maintenance → secondary private data.

### Conversations

```text
┌──────────────┬────────────────────┬─────────────────────────────────────┐
│ navigation   │ Conversations      │ Sarah Kang                          │
│              │ [Search threads]   │ 1,284 messages · Jun 2023–Jul 2026 │
│              │ Sarah Kang         │ ───────── Mar 14, 2024 ─────────── │
│              │ Dinner group       │ Sarah  try the place on Clement     │
│              │ +1 415…            │        Thu 7:42 PM                  │
│              │                    │             You  that looks great   │
│              │                    │        [Source match]                │
│              │                    │ [Newer] [Older]                     │
└──────────────┴────────────────────┴─────────────────────────────────────┘
```

Hierarchy: thread identity → archive context → chronological evidence → paging. No composer.

### Wrapped

```text
┌──────────────┬──────────────────────────────────────────────────────────┐
│ navigation   │ YOUR 2026                                      ‹ 2026 › │
│              │ 7,532 messages across 163 conversations                 │
│              │                                                          │
│              │ THIS WAS A MARCH YEAR.                                   │
│              │ March held 2,104 messages, your busiest month.           │
│              │                                                          │
│              │ [message strata — full width]                            │
│              │ Top people           Monthly arc                         │
│              │ Daily rhythm         Activity calendar                   │
└──────────────┴──────────────────────────────────────────────────────────┘
```

Hierarchy: year → deterministic story → signature motif → supporting evidence. Empty year states remain editorial and factual.

### Settings

```text
┌──────────────┬──────────────────────────────────────────────────────────┐
│ navigation   │ Settings                                                 │
│              │ Privacy & Local Data                                     │
│              │ Messages database     Read-only · Granted                │
│              │ OpenFolio database    [Reveal in Finder]                 │
│              │ Network              No app connections                  │
│              │ ───────────────────────────────────────────────────────  │
│              │ Sources / Search Index / Appearance / Advanced / About  │
│              │ Release address      [Copy address]                      │
└──────────────┴──────────────────────────────────────────────────────────┘
```

Hierarchy: privacy truth → source control → search health → appearance → advanced local tools → app version/manual replacement instructions and non-clickable release address.

### Onboarding

One centered 760px folio artifact inside the graphite shell. The left third shows step number and message strata; the right two-thirds contain one title, disclosure, status/progress, and actions. At most two actions per step. Back is available except during a destructive/cancellation confirmation.

### Website

Black outer field; warm paper sections framed as artifacts. Hero uses a 12-column grid: copy spans 6, a Search-to-citation product crop spans 6. Subsequent sections alternate full-width editorial statements and cropped app evidence. Wrapped provides the only substantially colorful section. Mobile ordering is copy → evidence → proof.

## Accessibility

- Target WCAG 2.2 AA. Body text and essential controls meet 4.5:1; large display text 3:1; focus and UI boundaries 3:1 against adjacent colors.
- Every interactive element is keyboard reachable in a logical order. Visible focus uses a 2px interaction-accent ring with 2px offset.
- `⌘K` has menu/shortcut semantics; all pointer-only hover information is also available on focus.
- Minimum target: 36×36px in the desktop app, 44×44px on touch-capable website layouts.
- Icon-only actions require an accessible name and tooltip; destructive actions require text in confirmation.
- Color never independently communicates sender, selection, status, heatmap value, or match type.
- Results and import progress announce updates through polite live regions; do not announce every keystroke.
- Search highlights use `<mark>` semantics; cited messages expose `aria-current="true"` or equivalent selection state.
- Charts have a concise summary plus an accessible data table or list.
- Dates use locale-aware display and machine-readable timestamps. Do not use relative dates without an exact accessible label.
- Respect macOS increased contrast, reduced transparency, and reduced motion where Electron exposes them.

## Responsiveness

The Mac app supports 760×560 minimum and scales through large desktop windows.

- `≥1180px`: sidebar + list/results + detail/preview when the page benefits from three panes.
- `900–1179px`: sidebar + primary content; details use Sheet or replace the content pane with a clear Back action.
- `760–899px`: 56px compact sidebar; single content pane; filters collapse; 24px page padding.
- Never horizontally compress a reading pane below 420px. Replace panes instead.
- Wrapped grids move 4 → 2 → 1 columns without reordering the story.
- Website breakpoints follow content rather than matching the Electron panes; mobile starts below 768px.
- Text zoom to 200% must not hide controls or require two-dimensional scrolling outside charts/code/path fields.
