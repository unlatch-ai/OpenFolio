import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ConnectorSyncResult,
  MessageThread,
  MessagesThreadSummary,
  NormalizedConnectorInteraction,
  NormalizedConnectorPerson,
  Note,
  Person,
  Reminder,
  ReminderSuggestion,
  RelationshipDigest,
  SearchDocument,
  SearchDocumentRecord,
  SearchResult,
  SourceKind,
} from "@openfolio/shared-types";
import {
  buildMessageSearchContent,
  buildNoteSearchContent,
  buildPersonSearchContent,
  buildReminderSearchContent,
  buildThreadSearchContent,
} from "./embeddings.js";
import { contentHash, cosineSimilarity, createId, normalizeQueryForFts, now } from "./utils.js";

const DEFAULT_DB_DIR = path.join(os.homedir(), "Library", "Application Support", "OpenFolio");

function stringify(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parseEmbedding(value: unknown): number[] | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "number")) {
      return parsed;
    }
  } catch (error) {
    console.warn("[openfolio-db] Failed to parse embedding:", error);
    return null;
  }

  return null;
}

type SearchTargets = {
  people?: string[];
  threads?: string[];
  messages?: string[];
  notes?: string[];
  reminders?: string[];
};

export class OpenFolioDatabase {
  readonly dbPath: string;

  private readonly db: DatabaseSync;

  constructor(dbPath = process.env.OPENFOLIO_LOCAL_DB_PATH || path.join(DEFAULT_DB_DIR, "openfolio.sqlite")) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.bootstrap();
  }

  bootstrap() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS source_accounts (
        id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL,
        display_name TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ingestion_cursors (
        source_kind TEXT PRIMARY KEY,
        cursor_value INTEGER,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS source_item_refs (
        id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL,
        source_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        UNIQUE(source_kind, source_id, entity_type)
      );

      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        primary_handle TEXT UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT
      );

      CREATE TABLE IF NOT EXISTS interactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        entity_id TEXT,
        title TEXT NOT NULL,
        summary TEXT,
        occurred_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        PRIMARY KEY (group_id, person_id)
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        person_id TEXT,
        due_at INTEGER,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS message_threads (
        id TEXT PRIMARY KEY,
        source_chat_id TEXT NOT NULL UNIQUE,
        display_name TEXT,
        participant_count INTEGER NOT NULL DEFAULT 0,
        last_message_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS message_participants (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        handle TEXT NOT NULL,
        service TEXT,
        UNIQUE (thread_id, handle)
      );

      CREATE TABLE IF NOT EXISTS message_messages (
        id TEXT PRIMARY KEY,
        source_message_id TEXT NOT NULL UNIQUE,
        thread_id TEXT NOT NULL,
        person_id TEXT,
        body TEXT,
        occurred_at INTEGER NOT NULL,
        is_from_me INTEGER NOT NULL DEFAULT 0,
        has_attachments INTEGER NOT NULL DEFAULT 0,
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS attachment_refs (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        path TEXT,
        mime_type TEXT,
        transfer_name TEXT
      );

      CREATE TABLE IF NOT EXISTS search_documents (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT,
        embedding_provider TEXT,
        embedding_model TEXT,
        content_hash TEXT NOT NULL DEFAULT '',
        embedded_at INTEGER,
        dirty INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS search_documents_kind_entity_idx
      ON search_documents(kind, entity_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts
      USING fts5(title, content, content='search_documents', content_rowid='rowid');

      CREATE TRIGGER IF NOT EXISTS search_documents_ai AFTER INSERT ON search_documents BEGIN
        INSERT INTO search_documents_fts(rowid, title, content)
        VALUES (new.rowid, new.title, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS search_documents_ad AFTER DELETE ON search_documents BEGIN
        INSERT INTO search_documents_fts(search_documents_fts, rowid, title, content)
        VALUES('delete', old.rowid, old.title, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS search_documents_au AFTER UPDATE ON search_documents BEGIN
        INSERT INTO search_documents_fts(search_documents_fts, rowid, title, content)
        VALUES('delete', old.rowid, old.title, old.content);
        INSERT INTO search_documents_fts(rowid, title, content)
        VALUES (new.rowid, new.title, new.content);
      END;
    `);

    this.ensureSearchDocumentColumn("embedding_provider", "TEXT");
    this.ensureSearchDocumentColumn("embedding_model", "TEXT");
    this.ensureSearchDocumentColumn("content_hash", "TEXT NOT NULL DEFAULT ''");
    this.ensureSearchDocumentColumn("embedded_at", "INTEGER");
    this.ensureSearchDocumentColumn("dirty", "INTEGER NOT NULL DEFAULT 1");
  }

  private ensureSearchDocumentColumn(column: string, type: string) {
    const columns = this.db.prepare("PRAGMA table_info(search_documents)").all() as Array<{ name: string }>;
    if (columns.some((entry) => entry.name === column)) {
      return;
    }

    this.db.exec(`ALTER TABLE search_documents ADD COLUMN ${column} ${type};`);
  }

  private buildSearchTargets(targets?: SearchTargets) {
    if (targets) {
      return targets;
    }

    return {
      people: this.db.prepare("SELECT id FROM people").all().map((row) => String((row as { id: string }).id)),
      threads: this.db.prepare("SELECT id FROM message_threads").all().map((row) => String((row as { id: string }).id)),
      messages: this.db.prepare("SELECT id FROM message_messages WHERE body IS NOT NULL AND body != ''").all().map((row) => String((row as { id: string }).id)),
      notes: this.db.prepare("SELECT id FROM notes").all().map((row) => String((row as { id: string }).id)),
      reminders: this.db.prepare("SELECT id FROM reminders").all().map((row) => String((row as { id: string }).id)),
    } satisfies SearchTargets;
  }

  getSetting(key: string) {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string) {
    this.db
      .prepare(`
        INSERT INTO settings(key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
      .run(key, value);
  }

  getCursor(sourceKind: string) {
    const row = this.db
      .prepare("SELECT cursor_value FROM ingestion_cursors WHERE source_kind = ?")
      .get(sourceKind) as { cursor_value: number | null } | undefined;
    return row?.cursor_value ?? null;
  }

  setCursor(sourceKind: string, cursorValue: number | null) {
    this.db
      .prepare(`
        INSERT INTO ingestion_cursors(source_kind, cursor_value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(source_kind) DO UPDATE SET
          cursor_value = excluded.cursor_value,
          updated_at = excluded.updated_at
      `)
      .run(sourceKind, cursorValue, now());
  }

  private getSourceRef(sourceKind: SourceKind, sourceId: string, entityType: string) {
    return this.db
      .prepare("SELECT entity_id AS entityId FROM source_item_refs WHERE source_kind = ? AND source_id = ? AND entity_type = ?")
      .get(sourceKind, sourceId, entityType) as { entityId: string } | undefined;
  }

  private setSourceRef(sourceKind: SourceKind, sourceId: string, entityType: string, entityId: string) {
    this.db
      .prepare(`
        INSERT INTO source_item_refs(id, source_kind, source_id, entity_type, entity_id)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_kind, source_id, entity_type) DO UPDATE SET entity_id = excluded.entity_id
      `)
      .run(createId("source_ref"), sourceKind, sourceId, entityType, entityId);
  }

  getOrCreatePerson(handle: string | null, fallbackName: string) {
    if (handle) {
      const existing = this.db
        .prepare("SELECT id, display_name AS displayName, primary_handle AS primaryHandle, created_at AS createdAt, updated_at AS updatedAt FROM people WHERE primary_handle = ?")
        .get(handle) as Person | undefined;
      if (existing) {
        if (existing.displayName !== fallbackName && fallbackName) {
          this.db
            .prepare("UPDATE people SET display_name = ?, updated_at = ? WHERE id = ?")
            .run(fallbackName, now(), existing.id);
          existing.displayName = fallbackName;
          existing.updatedAt = now();
        }
        return existing;
      }
    }

    const person: Person = {
      id: createId("person"),
      displayName: fallbackName,
      primaryHandle: handle,
      createdAt: now(),
      updatedAt: now(),
    };

    this.db
      .prepare(`
        INSERT INTO people(id, display_name, primary_handle, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(person.id, person.displayName, person.primaryHandle, person.createdAt, person.updatedAt);

    return person;
  }

  listPeople() {
    return this.db
      .prepare("SELECT id, display_name AS displayName, primary_handle AS primaryHandle, created_at AS createdAt, updated_at AS updatedAt FROM people ORDER BY updated_at DESC")
      .all() as unknown as Person[];
  }

  upsertThread(sourceChatId: string, displayName: string | null) {
    const existing = this.db
      .prepare("SELECT id, source_chat_id AS sourceChatId, display_name AS displayName, participant_count AS participantCount, last_message_at AS lastMessageAt FROM message_threads WHERE source_chat_id = ?")
      .get(sourceChatId) as MessageThread | undefined;

    if (existing) {
      if (displayName && existing.displayName !== displayName) {
        this.db
          .prepare("UPDATE message_threads SET display_name = ? WHERE id = ?")
          .run(displayName, existing.id);
        existing.displayName = displayName;
      }
      return existing;
    }

    const thread: MessageThread = {
      id: createId("thread"),
      sourceChatId,
      displayName,
      participantCount: 0,
      lastMessageAt: null,
    };

    this.db
      .prepare(`
        INSERT INTO message_threads(id, source_chat_id, display_name, participant_count, last_message_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(thread.id, thread.sourceChatId, thread.displayName, thread.participantCount, thread.lastMessageAt);

    return thread;
  }

  addParticipant(threadId: string, personId: string, handle: string, service: string | null) {
    this.db
      .prepare(`
        INSERT INTO message_participants(id, thread_id, person_id, handle, service)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, handle) DO UPDATE SET
          person_id = excluded.person_id,
          service = excluded.service
      `)
      .run(createId("participant"), threadId, personId, handle, service);

    this.db
      .prepare(`
        UPDATE message_threads
        SET participant_count = (
          SELECT COUNT(*) FROM message_participants WHERE thread_id = ?
        )
        WHERE id = ?
      `)
      .run(threadId, threadId);
  }

  insertMessage(input: {
    sourceMessageId: string;
    threadId: string;
    personId: string | null;
    body: string | null;
    occurredAt: number;
    isFromMe: boolean;
    attachments: Array<{ path: string | null; mimeType?: string | null; transferName?: string | null }>;
    metadata: Record<string, unknown>;
  }) {
    const existing = this.db
      .prepare("SELECT id FROM message_messages WHERE source_message_id = ?")
      .get(input.sourceMessageId) as { id: string } | undefined;

    if (existing) {
      return { inserted: false, messageId: existing.id };
    }

    const messageId = createId("message");
    this.db
      .prepare(`
        INSERT INTO message_messages(
          id, source_message_id, thread_id, person_id, body, occurred_at, is_from_me, has_attachments, metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        messageId,
        input.sourceMessageId,
        input.threadId,
        input.personId,
        input.body,
        input.occurredAt,
        input.isFromMe ? 1 : 0,
        input.attachments.length > 0 ? 1 : 0,
        stringify(input.metadata),
      );

    for (const attachment of input.attachments) {
      this.db
        .prepare(`
          INSERT INTO attachment_refs(id, message_id, path, mime_type, transfer_name)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(createId("attachment"), messageId, attachment.path, attachment.mimeType ?? null, attachment.transferName ?? null);
    }

    this.db
      .prepare("UPDATE message_threads SET last_message_at = MAX(COALESCE(last_message_at, 0), ?) WHERE id = ?")
      .run(input.occurredAt, input.threadId);

    this.db
      .prepare(`
        INSERT INTO interactions(id, type, entity_id, title, summary, occurred_at)
        VALUES (?, 'message', ?, ?, ?, ?)
      `)
      .run(createId("interaction"), input.threadId, input.body || "Message", input.body, input.occurredAt);

    return { inserted: true, messageId };
  }

  createNote(entityType: "person" | "thread" | "group", entityId: string, content: string): Note {
    const note: Note = {
      id: createId("note"),
      entityType,
      entityId,
      content,
      createdAt: now(),
    };

    this.db
      .prepare("INSERT INTO notes(id, entity_type, entity_id, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(note.id, note.entityType, note.entityId, note.content, note.createdAt);

    return note;
  }

  createReminder(title: string, personId: string | null, dueAt: number | null): Reminder {
    const reminder: Reminder = {
      id: createId("reminder"),
      title,
      personId,
      dueAt,
      status: "open",
      createdAt: now(),
    };

    this.db
      .prepare("INSERT INTO reminders(id, title, person_id, due_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(reminder.id, reminder.title, reminder.personId, reminder.dueAt, reminder.status, reminder.createdAt);

    return reminder;
  }

  listGroups() {
    return this.db.prepare("SELECT * FROM groups ORDER BY name ASC").all() as Array<{ id: string; name: string; description: string | null }>;
  }

  getPerson(personId: string) {
    return this.db
      .prepare("SELECT id, display_name AS displayName, primary_handle AS primaryHandle, created_at AS createdAt, updated_at AS updatedAt FROM people WHERE id = ?")
      .get(personId) as Person | undefined;
  }

  getThreadSummaries(limit = 20) {
    const rows = this.db
      .prepare(`
        SELECT
          t.id AS threadId,
          COALESCE(t.display_name, GROUP_CONCAT(DISTINCT mp.handle)) AS title,
          GROUP_CONCAT(DISTINCT mp.handle) AS participantHandles,
          (
            SELECT body FROM message_messages mm
            WHERE mm.thread_id = t.id
            ORDER BY occurred_at DESC
            LIMIT 1
          ) AS lastMessagePreview,
          t.last_message_at AS lastMessageAt
        FROM message_threads t
        LEFT JOIN message_participants mp ON mp.thread_id = t.id
        GROUP BY t.id
        ORDER BY t.last_message_at DESC
        LIMIT ?
      `)
      .all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      threadId: String(row.threadId),
      title: String(row.title ?? "Untitled Thread"),
      participantHandles: String(row.participantHandles ?? "").split(",").filter(Boolean),
      lastMessagePreview: (row.lastMessagePreview as string | null) ?? null,
      lastMessageAt: (row.lastMessageAt as number | null) ?? null,
    })) as MessagesThreadSummary[];
  }

  private buildPersonDocument(personId: string): SearchDocument | null {
    const person = this.getPerson(personId);
    if (!person) {
      return null;
    }

    const threadTitles = this.db
      .prepare(`
        SELECT DISTINCT COALESCE(t.display_name, mp.handle) AS title
        FROM message_participants mp
        JOIN message_threads t ON t.id = mp.thread_id
        WHERE mp.person_id = ?
        ORDER BY t.last_message_at DESC
        LIMIT 5
      `)
      .all(personId)
      .map((row) => String((row as { title: string }).title));

    const recentMessages = this.db
      .prepare(`
        SELECT mm.body AS body
        FROM message_participants mp
        JOIN message_messages mm ON mm.thread_id = mp.thread_id
        WHERE mp.person_id = ? AND mm.body IS NOT NULL AND mm.body != ''
        ORDER BY mm.occurred_at DESC
        LIMIT 5
      `)
      .all(personId)
      .map((row) => String((row as { body: string }).body));

    return {
      id: createId("doc"),
      kind: "person",
      entityId: person.id,
      title: person.displayName,
      content: buildPersonSearchContent({
        displayName: person.displayName,
        primaryHandle: person.primaryHandle,
        recentThreadTitles: threadTitles,
        recentMessages,
      }),
      embedding: null,
    };
  }

  private buildThreadDocument(threadId: string): SearchDocument | null {
    const thread = this.db
      .prepare("SELECT display_name AS displayName FROM message_threads WHERE id = ?")
      .get(threadId) as { displayName: string | null } | undefined;
    if (!thread) {
      return null;
    }

    const participantHandles = this.db
      .prepare("SELECT handle FROM message_participants WHERE thread_id = ? ORDER BY handle ASC")
      .all(threadId)
      .map((row) => String((row as { handle: string }).handle));
    const messages = this.db
      .prepare("SELECT body FROM message_messages WHERE thread_id = ? AND body IS NOT NULL AND body != '' ORDER BY occurred_at DESC LIMIT 12")
      .all(threadId)
      .map((row) => String((row as { body: string }).body));

    return {
      id: createId("doc"),
      kind: "thread",
      entityId: threadId,
      title: (thread.displayName ?? participantHandles.join(", ")) || "Message Thread",
      content: buildThreadSearchContent({
        title: (thread.displayName ?? participantHandles.join(", ")) || "Message Thread",
        participantHandles,
        messages,
      }),
      embedding: null,
    };
  }

  private buildMessageDocument(messageId: string): SearchDocument | null {
    const row = this.db
      .prepare(`
        SELECT
          mm.body AS body,
          GROUP_CONCAT(mp.handle) AS participantHandles
        FROM message_messages mm
        LEFT JOIN message_participants mp ON mp.thread_id = mm.thread_id
        WHERE mm.id = ?
        GROUP BY mm.id
      `)
      .get(messageId) as { body: string | null; participantHandles: string | null } | undefined;

    if (!row?.body) {
      return null;
    }

    return {
      id: createId("doc"),
      kind: "message",
      entityId: messageId,
      title: "Message",
      content: buildMessageSearchContent({
        title: "Message",
        body: row.body,
        participantHandles: String(row.participantHandles ?? "").split(",").filter(Boolean),
      }),
      embedding: null,
    };
  }

  private buildNoteDocument(noteId: string): SearchDocument | null {
    const note = this.db
      .prepare("SELECT entity_type AS entityType, content FROM notes WHERE id = ?")
      .get(noteId) as { entityType: string; content: string } | undefined;
    if (!note) {
      return null;
    }

    return {
      id: createId("doc"),
      kind: "note",
      entityId: noteId,
      title: "Note",
      content: buildNoteSearchContent({
        content: note.content,
        entityType: note.entityType,
      }),
      embedding: null,
    };
  }

  private buildReminderDocument(reminderId: string): SearchDocument | null {
    const reminder = this.db
      .prepare(`
        SELECT
          r.title AS title,
          r.due_at AS dueAt,
          p.display_name AS personName
        FROM reminders r
        LEFT JOIN people p ON p.id = r.person_id
        WHERE r.id = ?
      `)
      .get(reminderId) as { title: string; dueAt: number | null; personName: string | null } | undefined;
    if (!reminder) {
      return null;
    }

    return {
      id: createId("doc"),
      kind: "reminder",
      entityId: reminderId,
      title: reminder.title,
      content: buildReminderSearchContent(reminder),
      embedding: null,
    };
  }

  private upsertSearchDocument(document: SearchDocument) {
    const hash = contentHash([document.title, document.content].join("\n"));
    const existing = this.db
      .prepare(`
        SELECT
          id,
          content_hash AS contentHash,
          embedding AS embedding,
          embedding_provider AS embeddingProvider,
          embedding_model AS embeddingModel,
          embedded_at AS embeddedAt,
          dirty
        FROM search_documents
        WHERE kind = ? AND entity_id = ?
      `)
      .get(document.kind, document.entityId) as {
      id: string;
      contentHash: string;
      embedding: string | null;
      embeddingProvider: string | null;
      embeddingModel: string | null;
      embeddedAt: number | null;
      dirty: number;
    } | undefined;

    if (!existing) {
      this.db
        .prepare(`
          INSERT INTO search_documents(
            id, kind, entity_id, title, content, embedding, embedding_provider, embedding_model, content_hash, embedded_at, dirty, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          document.id,
          document.kind,
          document.entityId,
          document.title,
          document.content,
          null,
          null,
          null,
          hash,
          null,
          1,
          now(),
        );
      return;
    }

    const contentChanged = existing.contentHash !== hash;
    this.db
      .prepare(`
        UPDATE search_documents
        SET
          title = ?,
          content = ?,
          embedding = ?,
          embedding_provider = ?,
          embedding_model = ?,
          content_hash = ?,
          embedded_at = ?,
          dirty = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        document.title,
        document.content,
        contentChanged ? null : existing.embedding,
        contentChanged ? null : existing.embeddingProvider,
        contentChanged ? null : existing.embeddingModel,
        hash,
        contentChanged ? null : existing.embeddedAt,
        contentChanged ? 1 : existing.dirty,
        now(),
        existing.id,
      );
  }

  refreshSearchDocuments(targets?: SearchTargets) {
    const resolved = this.buildSearchTargets(targets);

    for (const personId of resolved.people ?? []) {
      const document = this.buildPersonDocument(personId);
      if (document) {
        this.upsertSearchDocument(document);
      }
    }
    for (const threadId of resolved.threads ?? []) {
      const document = this.buildThreadDocument(threadId);
      if (document) {
        this.upsertSearchDocument(document);
      }
    }
    for (const messageId of resolved.messages ?? []) {
      const document = this.buildMessageDocument(messageId);
      if (document) {
        this.upsertSearchDocument(document);
      }
    }
    for (const noteId of resolved.notes ?? []) {
      const document = this.buildNoteDocument(noteId);
      if (document) {
        this.upsertSearchDocument(document);
      }
    }
    for (const reminderId of resolved.reminders ?? []) {
      const document = this.buildReminderDocument(reminderId);
      if (document) {
        this.upsertSearchDocument(document);
      }
    }
  }

  getDirtySearchDocuments(limit = 50) {
    const rows = this.db
      .prepare(`
        SELECT
          id,
          kind,
          entity_id AS entityId,
          title,
          content,
          embedding,
          embedding_provider AS embeddingProvider,
          embedding_model AS embeddingModel,
          content_hash AS contentHash,
          embedded_at AS embeddedAt,
          dirty,
          updated_at AS updatedAt
        FROM search_documents
        WHERE dirty = 1
        ORDER BY updated_at DESC
        LIMIT ?
      `)
      .all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      kind: row.kind as SearchDocument["kind"],
      entityId: String(row.entityId),
      title: String(row.title),
      content: String(row.content),
      embedding: parseEmbedding(row.embedding),
      embeddingProvider: (row.embeddingProvider as SearchDocumentRecord["embeddingProvider"]) ?? null,
      embeddingModel: (row.embeddingModel as string | null) ?? null,
      contentHash: String(row.contentHash),
      embeddedAt: (row.embeddedAt as number | null) ?? null,
      dirty: Boolean(row.dirty),
      updatedAt: Number(row.updatedAt),
    })) as SearchDocumentRecord[];
  }

  markSearchDocumentEmbedded(documentId: string, embedding: number[], provider: string, model: string) {
    this.db
      .prepare(`
        UPDATE search_documents
        SET embedding = ?, embedding_provider = ?, embedding_model = ?, embedded_at = ?, dirty = 0
        WHERE id = ?
      `)
      .run(JSON.stringify(embedding), provider, model, now(), documentId);
  }

  applyConnectorSync(result: ConnectorSyncResult) {
    const dirtyTargets: SearchTargets = {
      people: [],
      threads: [],
      messages: [],
    };
    let interactionsCreated = 0;

    for (const person of result.people) {
      const persisted = this.upsertConnectorPerson(person);
      dirtyTargets.people?.push(persisted.id);
    }

    for (const interaction of result.interactions) {
      const created = this.upsertConnectorInteraction(interaction);
      if (created) {
        interactionsCreated += 1;
      }
    }

    this.refreshSearchDocuments(dirtyTargets);

    return {
      peopleImported: result.people.length,
      interactionsImported: interactionsCreated,
    };
  }

  private upsertConnectorPerson(person: NormalizedConnectorPerson) {
    const existingSource = this.getSourceRef(person.sourceKind, person.sourceId, "person");
    if (existingSource) {
      const existing = this.getPerson(existingSource.entityId);
      if (existing) {
        this.db
          .prepare("UPDATE people SET display_name = ?, primary_handle = COALESCE(?, primary_handle), updated_at = ? WHERE id = ?")
          .run(person.displayName, person.primaryHandle, now(), existing.id);
        return { ...existing, displayName: person.displayName, primaryHandle: person.primaryHandle ?? existing.primaryHandle };
      }
    }

    const persisted = this.getOrCreatePerson(person.primaryHandle, person.displayName);
    this.setSourceRef(person.sourceKind, person.sourceId, "person", persisted.id);
    return persisted;
  }

  private upsertConnectorInteraction(interaction: NormalizedConnectorInteraction) {
    const existingSource = this.getSourceRef(interaction.sourceKind, interaction.sourceId, "interaction");
    if (existingSource) {
      return false;
    }

    const interactionId = createId("interaction");
    this.db
      .prepare(`
        INSERT INTO interactions(id, type, entity_id, title, summary, occurred_at)
        VALUES (?, ?, NULL, ?, ?, ?)
      `)
      .run(interactionId, interaction.kind, interaction.title, interaction.summary, interaction.occurredAt);
    this.setSourceRef(interaction.sourceKind, interaction.sourceId, "interaction", interactionId);
    return true;
  }

  rebuildSearchDocuments() {
    this.refreshSearchDocuments();
  }

  search(query: string, limit = 10, queryEmbedding?: number[]) {
    const safeQuery = normalizeQueryForFts(query);
    const rows = safeQuery
      ? (this.db
          .prepare(`
            SELECT
              d.id,
              d.kind,
              d.entity_id AS entityId,
              d.title,
              d.content,
              d.embedding,
              bm25(search_documents_fts) AS textScore
            FROM search_documents_fts
            JOIN search_documents d ON d.rowid = search_documents_fts.rowid
            WHERE search_documents_fts MATCH ?
            ORDER BY textScore
            LIMIT ?
          `)
          .all(safeQuery, limit * 3) as Array<Record<string, unknown>>)
      : [];

    const escapedQuery = query.replace(/[%_]/g, (char) => `\\${char}`);
    const fallbackRows = rows.length === 0
      ? (this.db
          .prepare(`
            SELECT id, kind, entity_id AS entityId, title, content, embedding, 0 AS textScore
            FROM search_documents
            WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\'
            LIMIT ?
          `)
          .all(`%${escapedQuery}%`, `%${escapedQuery}%`, limit * 3) as Array<Record<string, unknown>>)
      : rows;

    const ranked = fallbackRows.map((row) => {
      const embedding = parseEmbedding(row.embedding);
      const semanticScore = queryEmbedding && embedding ? cosineSimilarity(queryEmbedding, embedding) : 0;
      const keywordScore = Number(row.textScore ?? 0);
      const combinedScore = semanticScore > 0 ? semanticScore - keywordScore : -keywordScore;

      return {
        id: String(row.id),
        kind: String(row.kind) as SearchResult["kind"],
        entityId: String(row.entityId),
        title: String(row.title),
        snippet: String(row.content).slice(0, 240),
        score: combinedScore,
      } satisfies SearchResult;
    });

    return ranked.sort((left, right) => right.score - left.score).slice(0, limit);
  }

  relationshipDigest(personId: string): RelationshipDigest | null {
    const person = this.getPerson(personId);
    if (!person) {
      return null;
    }

    const row = this.db
      .prepare(`
        SELECT
          MAX(mm.occurred_at) AS lastContactAt,
          COUNT(mm.id) AS messageCount,
          (SELECT COUNT(*) FROM notes WHERE entity_type = 'person' AND entity_id = ?) AS noteCount,
          (SELECT COUNT(*) FROM reminders WHERE person_id = ? AND status = 'open') AS reminderCount
        FROM message_participants mp
        LEFT JOIN message_messages mm ON mm.thread_id = mp.thread_id
        WHERE mp.person_id = ?
      `)
      .get(personId, personId, personId) as Record<string, unknown>;

    return {
      personId,
      displayName: person.displayName,
      lastContactAt: (row.lastContactAt as number | null) ?? null,
      messageCount: Number(row.messageCount ?? 0),
      noteCount: Number(row.noteCount ?? 0),
      reminderCount: Number(row.reminderCount ?? 0),
    };
  }

  generateReminderSuggestions(limit = 10) {
    const rows = this.db
      .prepare(`
        SELECT
          p.id AS personId,
          p.display_name AS displayName,
          MAX(mm.occurred_at) AS lastContactAt
        FROM people p
        LEFT JOIN message_participants mp ON mp.person_id = p.id
        LEFT JOIN message_messages mm ON mm.thread_id = mp.thread_id
        GROUP BY p.id
        ORDER BY lastContactAt ASC
        LIMIT ?
      `)
      .all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      personId: String(row.personId),
      displayName: String(row.displayName),
      reason: row.lastContactAt ? "No recent contact detected." : "Imported contact has no recorded follow-up yet.",
      suggestedDueAt: row.lastContactAt ? Number(row.lastContactAt) + 1000 * 60 * 60 * 24 * 7 : now() + 1000 * 60 * 60 * 24,
    })) as ReminderSuggestion[];
  }

  close() {
    this.db.close();
  }
}
