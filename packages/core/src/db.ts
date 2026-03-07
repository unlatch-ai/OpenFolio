import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  MessageThread,
  MessagesThreadSummary,
  Note,
  Person,
  Reminder,
  ReminderSuggestion,
  RelationshipDigest,
  SearchDocument,
  SearchResult,
} from "@openfolio/shared-types";
import { cosineSimilarity, createId, normalizeQueryForFts, now } from "./utils.js";

const DEFAULT_DB_DIR = path.join(os.homedir(), "Library", "Application Support", "OpenFolio");

function stringify(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parseEmbedding(value: unknown): number[] | null {
  if (typeof value !== "string" || value.length === 0) return null;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "number")) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

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
        updated_at INTEGER NOT NULL
      );

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
  }

  rawQuery(sql: string) {
    const statement = this.db.prepare(sql);
    return statement.all() as Record<string, unknown>[];
  }

  rawMutate(sql: string) {
    const result = this.db.prepare(sql).run();
    return { changes: Number(result.changes) };
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

  getOrCreatePerson(handle: string | null, fallbackName: string) {
    if (handle) {
      const existing = this.db
        .prepare("SELECT * FROM people WHERE primary_handle = ?")
        .get(handle) as Person | undefined;
      if (existing) return existing;
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

  upsertThread(sourceChatId: string, displayName: string | null) {
    const existing = this.db
      .prepare("SELECT * FROM message_threads WHERE source_chat_id = ?")
      .get(sourceChatId) as MessageThread | undefined;

    if (existing) return existing;

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

    if (existing) return false;

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
        stringify(input.metadata)
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

    return true;
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
    return this.db.prepare("SELECT * FROM people WHERE id = ?").get(personId) as Person | undefined;
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

    return rows
      .map((row) => ({
        threadId: String((row as Record<string, unknown>).threadId),
        title: String((row as Record<string, unknown>).title ?? "Untitled Thread"),
        participantHandles: String((row as Record<string, unknown>).participantHandles ?? "")
          .split(",")
          .filter(Boolean),
        lastMessagePreview: ((row as Record<string, unknown>).lastMessagePreview as string | null) ?? null,
        lastMessageAt: ((row as Record<string, unknown>).lastMessageAt as number | null) ?? null,
      })) as MessagesThreadSummary[];
  }

  rebuildSearchDocuments(embeddingProvider?: (input: SearchDocument) => number[] | null) {
    const insertDocument = this.db.prepare(`
      INSERT INTO search_documents(id, kind, entity_id, title, content, embedding, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.prepare("DELETE FROM search_documents").run();

    const people = this.db.prepare("SELECT * FROM people").all() as Array<Record<string, unknown>>;
    const threads = this.db.prepare("SELECT * FROM message_threads").all() as Array<Record<string, unknown>>;
    const messages = this.db.prepare("SELECT * FROM message_messages").all() as Array<Record<string, unknown>>;
    const notes = this.db.prepare("SELECT * FROM notes").all() as Array<Record<string, unknown>>;
    const reminders = this.db.prepare("SELECT * FROM reminders").all() as Array<Record<string, unknown>>;

    for (const person of people) {
      const doc: SearchDocument = {
        id: createId("doc"),
        kind: "person",
        entityId: String(person.id),
        title: String(person.display_name),
        content: [person.display_name, person.primary_handle].filter(Boolean).join(" "),
        embedding: null,
      };
      insertDocument.run(doc.id, doc.kind, doc.entityId, doc.title, doc.content, stringify(embeddingProvider?.(doc) ?? null), now());
    }

    for (const thread of threads) {
      const doc: SearchDocument = {
        id: createId("doc"),
        kind: "thread",
        entityId: String(thread.id),
        title: String(thread.display_name ?? "Message Thread"),
        content: String((this.db
          .prepare("SELECT GROUP_CONCAT(body, ' ') AS bodies FROM message_messages WHERE thread_id = ? ORDER BY occurred_at DESC LIMIT 50")
          .get(String(thread.id)) as { bodies?: string } | undefined)?.bodies ?? ""),
        embedding: null,
      };
      insertDocument.run(doc.id, doc.kind, doc.entityId, doc.title, doc.content, stringify(embeddingProvider?.(doc) ?? null), now());
    }

    for (const message of messages) {
      const content = String(message.body ?? "");
      if (!content) continue;
      const doc: SearchDocument = {
        id: createId("doc"),
        kind: "message",
        entityId: String(message.id),
        title: "Message",
        content,
        embedding: null,
      };
      insertDocument.run(doc.id, doc.kind, doc.entityId, doc.title, doc.content, stringify(embeddingProvider?.(doc) ?? null), now());
    }

    for (const note of notes) {
      const doc: SearchDocument = {
        id: createId("doc"),
        kind: "note",
        entityId: String(note.id),
        title: "Note",
        content: String(note.content),
        embedding: null,
      };
      insertDocument.run(doc.id, doc.kind, doc.entityId, doc.title, doc.content, stringify(embeddingProvider?.(doc) ?? null), now());
    }

    for (const reminder of reminders) {
      const doc: SearchDocument = {
        id: createId("doc"),
        kind: "reminder",
        entityId: String(reminder.id),
        title: "Reminder",
        content: String(reminder.title),
        embedding: null,
      };
      insertDocument.run(doc.id, doc.kind, doc.entityId, doc.title, doc.content, stringify(embeddingProvider?.(doc) ?? null), now());
    }
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

    const fallbackRows = rows.length === 0
      ? (this.db
          .prepare(`
            SELECT id, kind, entity_id AS entityId, title, content, embedding, 0 AS textScore
            FROM search_documents
            WHERE title LIKE ? OR content LIKE ?
            LIMIT ?
          `)
          .all(`%${query}%`, `%${query}%`, limit * 3) as Array<Record<string, unknown>>)
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
    if (!person) return null;

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
