# OpenFolio Product Contract

Status: approved July 2026
Last updated: July 2026

## Contract

**OpenFolio privately searches your entire iMessage history on your Mac, helps you find the person, fact, or message you remember, and lets you verify it in the original conversation.**

Tagline: **OpenFolio remembers who told you what.**

The literal value is not a relationship dashboard or an AI answer engine. It is fast, trustworthy recall across years of messages. The core loop is:

1. Describe what you remember.
2. Find the person, fact, or message.
3. Open the cited message in its original conversation and verify it.

## Product principles

- Search is the product and opens by default.
- Retrieval is evidence-first. A result is useful only when it can lead back to a real local source.
- Semantic retrieval and generated answers are different capabilities. Semantic retrieval ranks existing records; it does not write an answer or assert a new fact.
- Messages and the OpenFolio index stay on the Mac. From launch until every bundled process exits, the signed release governed by this contract makes no Internet, LAN, loopback, DNS, or other socket connection and does not open HTTP(S) in another app.
- People organize memory. Conversations preserve evidence. Wrapped creates reflection.
- Account creation is not part of local entry.
- The app reads Messages; it does not send, edit, delete, or back up messages.
- The interface should make uncertainty visible rather than pretending a retrieval result is an answer.

## Non-goals

The initial product is not:

- an iMessage client or reply surface;
- a personal CRM, relationship-health score, or generic relationship dashboard;
- a judge of who is “going quiet” or who the user should contact;
- a reminder, follow-up, or keep-in-touch system;
- a generated-answer product;
- a cloud sync, raw Messages backup, hosted connector, or hosted monetization surface;
- an Obsidian product or MCP product in its initial pitch;
- a place to infer sentiment, relationship quality, intent, or facts not present in source material.

Existing notes and reminders may remain accessible during migration, but they are secondary utilities and must not shape the navigation, Search page, marketing pitch, or success metrics.

## Exact information architecture

Primary navigation, in order:

1. **Search** — default route and primary workflow.
2. **People** — browse and inspect person dossiers.
3. **Conversations** — browse the original message archive.
4. **Wrapped** — annual, deterministic editorial artifact.
5. **Settings** — permissions, local data, appearance, search status, and app information.

There is no Home dashboard. Search occupies that role.

### Global shell

- Persistent 232px graphite sidebar on wide windows.
- OpenFolio wordmark at top; no gradient logo tile.
- Search is the first selected navigation item and has the `⌘K` shortcut.
- Local status appears near the bottom as one quiet line: `On this Mac · Ready`, `Importing · 42%`, or `Messages access needed`.
- Settings sits at the bottom, separated from content navigation.
- Obsidian and MCP do not appear in primary navigation. If retained during migration, MCP lives under a collapsed `Advanced` section and is labeled a later interface.

### Route and selection behavior

- Launch after setup → Search, empty query, focused search field.
- Search result → cited message selected in Conversations, with the exact message centered and highlighted.
- Person result → person dossier, with `Search messages` available in that person scope.
- Conversation result → conversation archive at the latest relevant match, or latest message when no match exists.
- Person dossier conversation row → the selected Conversations thread.
- Wrapped person row → that person dossier, not a speculative per-person story.
- Back/forward restores route, query, filters, selected result, and scroll position for the current session.

## Onboarding through first successful search

Onboarding is a focused sequence, not a dashboard checklist. Contacts and semantic indexing must never block entry once Messages import has produced searchable records.

### 1. Welcome

Headline: `Remember who told you what.`

Body: `Search your iMessage history privately on this Mac, then verify every result in the original conversation.`

Primary action: `Set up OpenFolio`
Secondary action: `How privacy works` opens an in-app disclosure, not a website.

### 2. Messages access

Headline: `Allow read-only access to Messages`

Body: `OpenFolio needs Full Disk Access to read the Messages database already stored on this Mac.`

Disclosure:

- Reads local message history.
- Builds a separate local search index.
- Never sends or changes messages.
- Does not upload message or contact data.

Primary action: `Open System Settings`
After returning: recheck automatically while this step is visible, with a manual `Check again` fallback.

### 3. Import

Headline: `Building your private archive`

Show four truthful activity rows: `Reading conversations`, `Resolving participants`, `Preparing exact search`, and `Preparing semantic search`. Show counts only when the backend supplies them. Do not invent time remaining.

As soon as exact search has records, enable `Try your first search`. Import can continue in the background. Cancellation and retry remain available through a quiet secondary action.

### 4. Contacts, optional

Headline: `Put names to numbers`

Body: `Apple Contacts can match phone numbers and email addresses to names. Contact data stays on this Mac.`

Actions: `Sync Contacts` and `Skip`.

This step may appear before the first-search prompt if import is still running, but it is never required.

### 5. First search

Land in Search with this prompt above the focused field: `Try something you remember clearly.` Suggested queries must teach literal recall, not analytics:

- `the ramen place Jordan recommended`
- `who told me about the red-eye to Tokyo`
- `messages about the lease renewal`

Success occurs when at least one result opens to the cited message in Conversations. A small one-time callout says: `This is the original message. Search always brings you back to the source.` No confetti or account prompt.

### Failure and recovery

- Permission denied: explain the exact macOS setting and preserve retry.
- No Messages database: say that no readable local Messages history was found; do not imply data loss.
- Import failed: preserve completed records and offer `Retry import` plus local diagnostics.
- Semantic index unavailable: exact search remains enabled. State `Meaning-based matches are still being prepared` or `Semantic search is unavailable`; never call exact search broken.
- No contacts: use stable handle labels and `Unknown contact`, never a blank identity.

## Search

### Page anatomy

Search is a full page, not primarily a command-palette modal.

1. Editorial header: tagline on first launch; compact `Search` title thereafter.
2. Large query field with clear button and `⌘K` shortcut hint.
3. One line of rotating examples before the first query only.
4. Filter bar.
5. Result count and retrieval-status line.
6. Ranked result list.
7. Optional right-side evidence preview at windows 1180px and wider.

`⌘K` navigates to Search and focuses/selects the current query. It does not hide results in a modal. `Escape` clears an active result preview first, then the query.

### Retrieval behavior

- Default `Best match` blends full-text and local semantic similarity.
- Exact matches remain available before semantic indexing completes.
- Results are records, not generated prose.
- Search does not answer `why`, `what should I do`, sentiment, or relationship-health questions.
- If a natural-language query resembles a question, the UI still says `Matches` and shows evidence. It must not format the top snippets as an answer.
- Ranking confidence is internal. Do not show a fake percentage.

The core and renderer bridge now expose blended full-text/local-semantic retrieval, person, conversation, date, and result-type filters, plus deterministic match metadata. Exact search remains available while the semantic index is incomplete or unavailable.

### Filters

Initial release filters:

- `Type`: All, Messages, People, Conversations.
- `Person`: one or more resolved people/handles.
- `Conversation`: one thread.
- `Date`: Any time, This year, Last year, Custom range.

Rules:

- Filters narrow retrieval; they do not change the meaning of the query.
- Person and Conversation are mutually narrowing, not mutually exclusive.
- Applied filters use compact removable chips; the filter controls themselves are not all permanent pills.
- Notes and reminders are omitted from the primary filter set. Existing records may appear under `More local records` during migration.
- No `Ask`, model, provider, or AI mode toggle appears on Search.

### Result and citation model

Every visible result has:

- stable result ID and source entity ID;
- type: Message, Person, or Conversation;
- primary label: participant/person/conversation name;
- source label: conversation title plus other participants when relevant;
- occurred-at timestamp for messages;
- snippet, with matched words highlighted and semantic matches left unhighlighted;
- direction (`You` or named sender) when the source is a message;
- deterministic match reason: `Exact words`, `Related wording`, `Person`, or `Conversation title`;
- navigation target: person ID, thread ID, and message ID when applicable.

The citation label is: `Person · Conversation · Mon D, YYYY at H:MM AM`. Unknown pieces are omitted, not replaced with guesses.

Selecting a result opens the evidence preview. The primary action is `Open in conversation`. Message citations must deep-link to the exact imported message. Person and conversation records may link to their canonical page without inventing a message citation.

### States

- **Pristine:** examples and a short privacy line; no fake recent searches.
- **Typing:** keep prior results visible until the new query resolves; mark them subdued with `Searching…`.
- **Results:** ranked list, filters, count, and semantic readiness.
- **Partial index:** banner within Search, not a blocking modal: `Search is ready. Meaning-based matches will improve as indexing finishes.`
- **No results:** `No messages matched that memory.` Offer filter removal and literal query tips; never suggest enabling cloud AI.
- **Error:** preserve query and filters; `Search could not read the local index. Try again.` Include `Copy diagnostics` only after repeat failure.
- **No imported data:** route back to the relevant setup recovery step.
- **Selected citation:** preview the exact source context with the match centered and surrounding messages clearly outside the citation.

### Example queries

Good:

- `the dumpling place Maya liked in the Richmond`
- `flight number for Sam's wedding`
- `who mentioned a designer named Priya`
- `messages with Alex about moving in May`
- `"garage code"`
- `the Tahoe cabin address`

Avoid in product examples:

- `who should I reach out to?`
- `which relationships are going quiet?`
- `summarize my friendship with Sarah`
- `what does Jordan think of me?`
- `write a reply`

## Secondary surfaces

### People

Role: a browsable index of humans represented in the archive.

- Dense list plus dossier detail on wide windows; stacked navigation on narrow windows.
- Search by name, alias, phone, or email.
- Sort by Recent, Most messages, and A–Z. Do not sort by inferred relationship quality.
- Unknown contacts are legitimate archive entries and show their stable handle plus message count.
- Person dossier is read-first: identity, message strata, first/last contact, total messages, deterministic rhythm, conversations, and person-scoped search.
- Identity editing and aliases are secondary actions.
- Existing private notes can live in a collapsed `Private notes` section. Reminders are migration-only and not promoted.
- Deterministic statistics must say what was measured; there is no narrative AI summary.

### Conversations

Role: the evidence archive and verification destination.

- Two-pane archive at wide widths: 300–340px thread index and flexible reading pane.
- Not a faux chat client. No composer, delivery status, reaction affordances, or reply action.
- Date rules divide the archive; messages use restrained blocks and alignment rather than bright chat bubbles.
- Header contains participants, message count, date range when available, and links to related people.
- Search citations center and highlight the exact message while retaining surrounding context.
- Attachments show known filename/type/date metadata. Unsupported content is labeled `Attachment`; raw payload names stay behind diagnostics.
- Older/newer paging remains explicit and stable.

### Wrapped

Role: an editorial annual artifact made entirely from deterministic local statistics.

- Year selector, annual opening statement, key totals, top people, monthly arc, daily rhythm, and message-strata field.
- It may say `March was your busiest month` when counts prove it.
- It may not claim why activity changed, what a relationship meant, or what topics dominated without a separately designed, source-cited capability.
- Initial release is view-only. Share-card generation and per-person narrative Wrapped are future work.
- Wrapped may become full-bleed and more expressive than the rest of the app while preserving accessible contrast.

### Settings

Role: trust and local control, not product marketing.

Sections, in order:

1. Privacy & Local Data
2. Sources
3. Search Index
4. Appearance
5. Advanced
6. About

The initial product has no Account or AI section. `Advanced` may contain local diagnostics and later-interface MCP status, collapsed by default. It must not imply MCP is necessary to use OpenFolio. Before copying any MCP configuration, disclose that OpenFolio's stdio server stays offline but the external MCP client receives private results and may transmit them under its own policy. About shows the installed version, browser-independent replacement instructions, and the canonical release URL as copyable plain text. OpenFolio never opens it.

### Website

Role: explain, prove, and route to the Mac download/docs. The website does not mirror the app or host the archive.

Hero:

- Eyebrow: `Private iMessage search for Mac`
- Headline: `OpenFolio remembers who told you what.`
- Body: `Describe what you remember. Find the message across your entire iMessage history. Verify it in the original conversation. Everything happens on your Mac.`
- Actions: `Download for Mac` and `See how privacy works`.

Section order:

1. Search a remembered detail.
2. See evidence, not an invented answer.
3. Browse people and original conversations.
4. Revisit the year through Wrapped.
5. Understand the zero-network boundary.
6. Open-source/build details.

Obsidian and MCP may appear in developer docs as future sources/interfaces, not in the hero or first three sections.

## Privacy and update copy

Use these strings consistently in app and website:

**Short privacy line**
`Your messages and search index stay on this Mac.`

**Expanded privacy statement**
`OpenFolio reads the iMessage database already stored on this Mac and builds a separate local search index. The app does not contact OpenFolio, OpenAI, GitHub, or any other service. It does not send, edit, delete, or back up your messages.`

**Semantic search statement**
`Meaning-based search runs with a model included in the app. Search text and message text never leave this Mac.`

**Contacts statement**
`Apple Contacts is optional. If enabled, OpenFolio uses it locally to match handles to names.`

**Updates statement**
`OpenFolio does not check for updates or connect to the Internet. To update, quit OpenFolio, independently open a browser, go to the release address shown below, download the signed release, and replace OpenFolio.app in Applications. Your library in Application Support remains in place.`

Canonical release address, rendered as selectable/copyable plain text and never as a link: `https://github.com/unlatch-ai/OpenFolio/releases/latest`.

**Website boundary**
`The OpenFolio website and GitHub download require the internet. Using the installed Mac app does not.`

The implementation in `main` removes automatic updater, runtime model-download, BYOK/OpenAI, hosted-auth, loopback, and external HTTP(S) handoff paths from the Mac product; bundles and verifies the approved local model; and fails closed to exact search if semantic assets are missing or invalid. Code removal, artifact scanning, and request denial are necessary but not sufficient proof: the final signed/notarized artifact and every bundled helper must still pass PID-attributed zero-traffic testing on real macOS.
