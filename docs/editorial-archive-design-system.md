# OpenFolio Design System

Status: implemented foundation July 2026
Depends on: [product-contract.md](./product-contract.md)

## Direction

OpenFolio is a quiet local search tool. Its interface should make private data
feel legible and trustworthy without turning it into a themed artifact.

The visual system is grayscale-first: two close neutral surfaces, clear type,
hairline structure, and generous spacing. Color carries meaning rather than
decoration. A restrained steel blue marks focus, selection, links, and cited
evidence. Red, green, and amber are reserved for real error, success, and
warning states.

The product should feel calm, precise, and native to the Mac. It must not look
like an iMessage clone, CRM, generic dashboard, developer console, scrapbook,
or luxury editorial site.

## Source of truth

All app and website components consume the semantic tokens in
`packages/shared-tokens/tokens.css`. Component and page styles may compose or
mix tokens, but must not create a second palette.

The Mac app and public website share the same visual grammar. Their layouts can
differ, but the meaning of surface, text, rule, action, focus, selection, and
status colors cannot drift.

## Color

### Neutral surfaces

| Token | Value | Role |
| --- | --- | --- |
| `paper` | `#F9F9F7` | page canvas |
| `chalk` | `#FCFCFB` | sidebar and raised content surface |
| `muted` | `#F1F1EE` | selected-neutral and section surface |
| `border` | `#E1E0D9` | default hairline |
| `input` | `#CFCEC7` | stronger control edge |
| `paper-ink` | `#0B0B0B` | primary text and action |
| `muted-foreground` | `#686762` | secondary text |
| `ash` | `#898781` | tertiary structure |

Use surface changes and rules before adding a card. Standard content regions
have no shadow. Avoid large dark bands, decorative gradients, tinted page
backgrounds, and permanent dark navigation.

### Interaction and status

| Token | Value | Role |
| --- | --- | --- |
| `interaction-accent` | `#315F86` | focus, selection, links, cited evidence |
| `interaction-accent-hover` | `#244B6D` | accent hover/pressed |
| `interaction-accent-soft` | `#E8F0F6` | selected or cited surface |
| `critical` | `#B83232` | destructive/error only |
| `success` | `#207044` | verified/ready only |
| `warning` | `#9A6518` | blocked/partial only |

Primary actions are ink, not blue. Blue should answer a specific question:
where focus is, what is selected, what is linked, or which evidence matched.
Status colors always appear with text or an icon.

Avatars and ordinary charts are grayscale. Additional series color is allowed
only when a real analytical view cannot remain legible without it; it must be
documented as a semantic extension rather than selected from a decorative
palette.

## Typography

Use the system sans stack for all product and marketing text:

`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`

Use the system mono stack only for paths, versions, timestamps, identifiers,
diagnostics, and fixed-width numeric readouts. No remote font requests are
allowed. Serif is not part of the current product language.

| Role | Size / line | Weight |
| --- | --- | --- |
| Display | `32 / 38` | 600–650 |
| Feature | `28 / 34` | 600–650 |
| Page title | `22 / 28` | 600–650 |
| Story title | `18 / 24` | 600 |
| UI title | `16 / 22` | 600 |
| Body | `13 / 20` | 400 |
| Label | `12 / 16` | 600 |
| Metadata | `11 / 16` | 400–600 |

Marketing displays may scale above 32px while retaining the same face and
weight discipline. Interface text must not fall below 11px. Uppercase and
tracking are limited to short metadata, never paragraphs or main navigation.

## Spacing and layout

The base unit is 4px. Use the shared `space-1` through `space-12` scale:

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px`

- Group label and value at 4–8px.
- Separate controls within one task at 8–12px.
- Separate component groups at 16–24px.
- Separate page regions at 32–48px.
- Use 64–96px only for public-page sections or intentional empty space.
- Align repeated rows to the same inset and baseline.
- Prefer rule-separated rows over isolated cards.
- Keep reading columns narrow enough to scan; dense data panes may be wider.

Standard control height is 36px, compact control height is 28px, and prominent
search height is 48–52px. Dense list rows are 52–64px. Desktop content padding
is 32–40px; compact padding is 20–24px.

The Mac window supports 900×640 and above. At widths below 1040px, navigation
collapses to its icon rail and master-detail screens show one pane at a time.
Flexible text cells always use `min-width: 0`; one-line names and metadata
truncate, prose wraps, and trailing dates or actions never shrink. Control
groups wrap before they can force horizontal scrolling.

Page headers use one eyebrow, one title, and at most one metadata line. Do not
repeat the destination name as a folio mark, eyebrow, and title. Reserve the
OpenFolio mark for setup and other genuine brand moments.

## Shape and elevation

- Hairline details: 2px radius.
- Controls and panels: 4px radius.
- Pills: only status, filters, or true capsule controls.
- Circles: only avatars, status dots, and icon-only controls.
- Standard cards and rows: no shadow.
- Menus/popovers: `shadow-floating`.
- Dialogs/sheets: `shadow-modal`.

Do not stack rounded rectangles. If a parent surface already groups content,
use spacing and rules inside it.

## Motion

Motion confirms state; it does not provide atmosphere.

| Token | Duration | Use |
| --- | --- | --- |
| `motion-instant` | 80ms | press/selection response |
| `motion-fast` | 120ms | hover/focus color |
| `motion-base` | 180ms | pane or result transition |
| `motion-slow` | 240ms | dialog or sheet |

No bounce, parallax, looping background, decorative cursor motion, or default
spring. Under `prefers-reduced-motion`, remove translation and sequencing.

## Language

Name the user’s task directly. Prefer:

- Search
- Evidence
- People
- Conversations
- Year in review
- Messages access
- Local index
- Open original conversation

Do not use faux-archival labels such as “Folio 001,” “Recall Index,” “Source
Leaf,” “Person Dossier,” or “Evidence Archive.” Avoid language that implies the
product interprets relationships or generates truth. Keep strong product lines
when they are concrete, including “Find the message. Keep the context.”

Privacy copy distinguishes the installed app from the website and download
flow. “Zero network” is a release claim backed by the signed-artifact process,
not a decorative badge.

## Core patterns

### Navigation

The sidebar is a neutral surface divided by one hairline. The selected item has
a subtle neutral/blue-soft background and a 2px accent marker. Icons and labels
stay monochrome. Local readiness uses a semantic status with text.

### Search and evidence

Search is the default page. The field is prominent but flat. Results are
rule-separated rows. Selection uses the soft accent and a 2px marker. The exact
cited message uses the same evidence accent; surrounding context stays neutral.
Match type and timestamps use metadata sizing, never tiny decorative labels.

### People and conversations

People are records, not dossiers. Use grayscale avatars, direct headings, and
stable rows. Conversations prioritize chronology and cited-message navigation.
Avoid bubble decoration when a simple aligned transcript is clearer.

### Settings and onboarding

Group settings by task with headings and rules, not nested cards. Put status
beside the control it explains. Before required setup is complete, do not render
the application shell or inactive navigation. Onboarding is one centered task
at a time: welcome, Messages access, local indexing, then ready. The welcome
screen has one primary action. Permission copy explains read-only access and
the enforced zero-network boundary before opening System Settings. Never show
raw filesystem errors, decorative sequence numbers, dashboards, optional
Contacts setup, or progress accounting such as “0 of 2 required” in first-run
onboarding.

### Public website

Use one continuous neutral canvas with thin section boundaries. Keep the hero
type disciplined, the product demo flat, and the main CTA ink. Use the accent
for links, focus, and selected evidence. The website demonstrates the same
search-to-source loop as the app and preserves the exact privacy boundary.

## Accessibility and review

- Keyboard focus is always visible with the accent ring.
- Text and controls meet WCAG AA contrast.
- Color is never the only state carrier.
- Icon-only controls have accessible names.
- Dialogs and sheets have visible or programmatic titles.
- Layouts remain usable at compact Mac window sizes and mobile web widths.
- Visual QA covers Search, People, Conversations, Year in review, Settings,
  onboarding, and the homepage before merge.

## Anti-patterns

Reject a change when it introduces:

- a one-off color, radius, shadow, or spacing scale;
- blue on a surface that is neither interactive nor evidentiary;
- semantic red/green/amber as decoration;
- metadata below 11px in the product UI;
- a card where spacing and one rule would group the content;
- editorial metaphors that make the task less clear;
- public privacy language stronger than the current release evidence.
