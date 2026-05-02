import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ConnectorSyncResult,
  EditablePersonProfile,
  MessageAttachment,
  MessageThread,
  MessagesThreadSummary,
  MessageDetail,
  NormalizedConnectorInteraction,
  NormalizedConnectorPerson,
  Note,
  Person,
  PersonAlias,
  PersonProfile,
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
import { contentHash, cosineSimilarity, createId, normalizeHandle, normalizeQueryForFts, now } from "./utils.js";

const DEFAULT_DB_DIR = path.join(os.homedir(), "Library", "Application Support", "OpenFolio");
const CURRENT_SCHEMA_VERSION = 3;

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

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== "string" || !value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function mapPerson(row: Record<string, unknown>): Person {
  return {
    id: String(row.id),
    displayName: String(row.displayName),
    primaryHandle: (row.primaryHandle as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    companyName: (row.companyName as string | null) ?? null,
    jobTitle: (row.jobTitle as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    sourceKinds: parseJsonArray(row.sourceKinds) as Person["sourceKinds"],
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

function mapAlias(row: Record<string, unknown>): PersonAlias {
  return {
    id: String(row.id),
    personId: String(row.personId),
    value: String(row.value),
    kind: row.kind === "handle" || row.kind === "name" ? row.kind : "other",
    createdAt: Number(row.createdAt),
  };
}

function mapNote(row: Record<string, unknown>): Note {
  return {
    id: String(row.id),
    entityType: row.entityType as Note["entityType"],
    entityId: String(row.entityId),
    content: String(row.content),
    pinned: Boolean(row.pinned),
    pinnedAt: (row.pinnedAt as number | null) ?? null,
    createdAt: Number(row.createdAt),
  };
}

function mapReminder(row: Record<string, unknown>): Reminder {
  return {
    id: String(row.id),
    title: String(row.title),
    personId: (row.personId as string | null) ?? null,
    dueAt: (row.dueAt as number | null) ?? null,
    status: row.status === "done" ? "done" : "open",
    createdAt: Number(row.createdAt),
  };
}

type SearchScope = {
  sourceScope?: "all" | "person" | "thread";
  personId?: string | null;
  threadId?: string | null;
};

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
    this.resetIncompatibleSchema();
    this.bootstrap();
  }

  private resetIncompatibleSchema() {
    const version = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    const hasExistingTables = (this.db
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .get() as { count: number }).count > 0;

    if (!hasExistingTables || version.user_version === CURRENT_SCHEMA_VERSION) {
      return;
    }

    this.db.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TRIGGER IF EXISTS search_documents_ai;
      DROP TRIGGER IF EXISTS search_documents_ad;
      DROP TRIGGER IF EXISTS search_documents_au;
      DROP TABLE IF EXISTS search_documents_fts;
      DROP TABLE IF EXISTS attachment_refs;
      DROP TABLE IF EXISTS message_messages;
      DROP TABLE IF EXISTS message_participants;
      DROP TABLE IF EXISTS message_threads;
      DROP TABLE IF EXISTS reminders;
      DROP TABLE IF EXISTS notes;
      DROP TABLE IF EXISTS person_aliases;
      DROP TABLE IF EXISTS tags;
      DROP TABLE IF EXISTS group_members;
      DROP TABLE IF EXISTS groups;
      DROP TABLE IF EXISTS interactions;
      DROP TABLE IF EXISTS companies;
      DROP TABLE IF EXISTS people;
      DROP TABLE IF EXISTS source_item_refs;
      DROP TABLE IF EXISTS ingestion_cursors;
      DROP TABLE IF EXISTS source_accounts;
      DROP TABLE IF EXISTS settings;
      PRAGMA foreign_keys = ON;
    `);
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
        email TEXT,
        phone TEXT,
        company_name TEXT,
        job_title TEXT,
        bio TEXT,
        location TEXT,
        source_kinds TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS person_aliases (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        value TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(person_id, value)
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
        pinned INTEGER NOT NULL DEFAULT 0,
        pinned_at INTEGER,
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

      CREATE INDEX IF NOT EXISTS mm_thread_occurred_idx
      ON message_messages(thread_id, occurred_at DESC);

      CREATE INDEX IF NOT EXISTS mm_person_occurred_idx
      ON message_messages(person_id, occurred_at DESC);

      CREATE INDEX IF NOT EXISTS person_aliases_person_idx
      ON person_aliases(person_id);

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
    this.db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION};`);
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
    const normalizedHandle = normalizeHandle(handle);

    if (normalizedHandle) {
      const existing = this.db
        .prepare(`
          SELECT id, display_name AS displayName, primary_handle AS primaryHandle,
            email, phone, company_name AS companyName, job_title AS jobTitle, bio, location,
            source_kinds AS sourceKinds, created_at AS createdAt, updated_at AS updatedAt
          FROM people WHERE primary_handle = ?
        `)
        .get(normalizedHandle) as Record<string, unknown> | undefined;
      if (existing) {
        const person = mapPerson(existing);
        if (person.displayName !== fallbackName && fallbackName) {
          const updatedAt = now();
          this.db
            .prepare("UPDATE people SET display_name = ?, updated_at = ? WHERE id = ?")
            .run(fallbackName, updatedAt, person.id);
          person.displayName = fallbackName;
          person.updatedAt = updatedAt;
        }
        return person;
      }
    }

    const person: Person = {
      id: createId("person"),
      displayName: fallbackName,
      primaryHandle: normalizedHandle,
      createdAt: now(),
      updatedAt: now(),
    };

    this.db
      .prepare(`
        INSERT INTO people(id, display_name, primary_handle, email, phone, company_name, job_title, bio, location, source_kinds, created_at, updated_at)
        VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, '["messages"]', ?, ?)
      `)
      .run(person.id, person.displayName, person.primaryHandle, person.createdAt, person.updatedAt);

    return person;
  }

  listPeople() {
    return (this.db
      .prepare(`
        SELECT id, display_name AS displayName, primary_handle AS primaryHandle,
          email, phone, company_name AS companyName, job_title AS jobTitle, bio, location,
          source_kinds AS sourceKinds, created_at AS createdAt, updated_at AS updatedAt
        FROM people ORDER BY updated_at DESC
      `)
      .all() as Array<Record<string, unknown>>).map(mapPerson);
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
      pinned: false,
      pinnedAt: null,
      createdAt: now(),
    };

    this.db
      .prepare("INSERT INTO notes(id, entity_type, entity_id, content, pinned, pinned_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(note.id, note.entityType, note.entityId, note.content, note.pinned ? 1 : 0, note.pinnedAt, note.createdAt);

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
    const row = this.db
      .prepare(`
        SELECT id, display_name AS displayName, primary_handle AS primaryHandle,
          email, phone, company_name AS companyName, job_title AS jobTitle, bio, location,
          source_kinds AS sourceKinds, created_at AS createdAt, updated_at AS updatedAt
        FROM people WHERE id = ?
      `)
      .get(personId) as Record<string, unknown> | undefined;
    return row ? mapPerson(row) : undefined;
  }

  updatePersonProfile(personId: string, profile: EditablePersonProfile) {
    const existing = this.getPerson(personId);
    if (!existing) {
      return null;
    }

    const normalizedPrimaryHandle = profile.primaryHandle === undefined ? existing.primaryHandle : normalizeHandle(profile.primaryHandle);
    const updatedAt = now();
    this.db
      .prepare(`
        UPDATE people SET
          display_name = ?,
          primary_handle = ?,
          email = ?,
          phone = ?,
          company_name = ?,
          job_title = ?,
          bio = ?,
          location = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        profile.displayName?.trim() || existing.displayName,
        normalizedPrimaryHandle,
        profile.email === undefined ? existing.email ?? null : normalizeHandle(profile.email),
        profile.phone === undefined ? existing.phone ?? null : normalizeHandle(profile.phone),
        profile.companyName === undefined ? existing.companyName ?? null : profile.companyName?.trim() || null,
        profile.jobTitle === undefined ? existing.jobTitle ?? null : profile.jobTitle?.trim() || null,
        profile.bio === undefined ? existing.bio ?? null : profile.bio?.trim() || null,
        profile.location === undefined ? existing.location ?? null : profile.location?.trim() || null,
        updatedAt,
        personId,
      );

    return this.getPerson(personId) ?? null;
  }

  getPersonAliases(personId: string): PersonAlias[] {
    const rows = this.db
      .prepare(`
        SELECT id, person_id AS personId, value, kind, created_at AS createdAt
        FROM person_aliases
        WHERE person_id = ?
        ORDER BY created_at DESC
      `)
      .all(personId) as Array<Record<string, unknown>>;
    return rows.map(mapAlias);
  }

  addPersonAlias(personId: string, value: string, kind: PersonAlias["kind"] = "other"): PersonAlias {
    if (!this.getPerson(personId)) {
      throw new Error("Person not found.");
    }

    const normalizedValue = kind === "handle" ? normalizeHandle(value) : value.trim();
    if (!normalizedValue) {
      throw new Error("Alias cannot be empty.");
    }

    const createdAt = now();
    const id = createId("alias");
    this.db
      .prepare(`
        INSERT INTO person_aliases(id, person_id, value, kind, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(person_id, value) DO UPDATE SET kind = excluded.kind
      `)
      .run(id, personId, normalizedValue, kind, createdAt);

    const row = this.db
      .prepare(`
        SELECT id, person_id AS personId, value, kind, created_at AS createdAt
        FROM person_aliases
        WHERE person_id = ? AND value = ?
      `)
      .get(personId, normalizedValue) as Record<string, unknown>;
    return mapAlias(row);
  }

  deletePersonAlias(aliasId: string) {
    const row = this.db
      .prepare("SELECT person_id AS personId FROM person_aliases WHERE id = ?")
      .get(aliasId) as { personId: string } | undefined;
    this.db.prepare("DELETE FROM person_aliases WHERE id = ?").run(aliasId);
    return row?.personId ?? null;
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

    const aliases = this.getPersonAliases(personId).map((alias) => alias.value);

    return {
      id: createId("doc"),
      kind: "person",
      entityId: person.id,
      title: person.displayName,
      content: buildPersonSearchContent({
        displayName: person.displayName,
        primaryHandle: person.primaryHandle,
        recentThreadTitles: [
          ...aliases,
          ...threadTitles,
          person.email,
          person.phone,
          person.companyName,
          person.jobTitle,
          person.bio,
          person.location,
        ].filter((value): value is string => Boolean(value)),
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
    const normalizedPrimaryHandle = normalizeHandle(person.primaryHandle);
    const normalizedEmail = normalizeHandle(person.email ?? null);
    const normalizedPhone = normalizeHandle(person.phone ?? null);
    const normalizedHandles = [
      normalizedPrimaryHandle,
      normalizedEmail,
      normalizedPhone,
      ...(Array.isArray(person.metadata?.handles) ? person.metadata.handles : [])
        .map((value) => typeof value === "string" ? normalizeHandle(value) : null),
    ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

    const persistDetails = (existing: Person, nextPrimaryHandle: string | null) => {
      const updatedAt = now();
      const sourceKinds = [...new Set([...(existing.sourceKinds ?? []), person.sourceKind])];
      this.db
        .prepare(`
          UPDATE people SET
            display_name = ?,
            primary_handle = COALESCE(?, primary_handle),
            email = COALESCE(?, email),
            phone = COALESCE(?, phone),
            company_name = COALESCE(?, company_name),
            job_title = COALESCE(?, job_title),
            bio = COALESCE(?, bio),
            location = COALESCE(?, location),
            source_kinds = ?,
            updated_at = ?
          WHERE id = ?
        `)
        .run(
          person.displayName,
          nextPrimaryHandle,
          normalizedEmail,
          normalizedPhone,
          person.companyName ?? null,
          person.jobTitle ?? null,
          person.bio ?? null,
          person.location ?? null,
          stringify(sourceKinds),
          updatedAt,
          existing.id,
        );
      return {
        ...existing,
        displayName: person.displayName,
        primaryHandle: existing.primaryHandle ?? nextPrimaryHandle,
        email: existing.email ?? normalizedEmail,
        phone: existing.phone ?? normalizedPhone,
        companyName: existing.companyName ?? person.companyName ?? null,
        jobTitle: existing.jobTitle ?? person.jobTitle ?? null,
        bio: existing.bio ?? person.bio ?? null,
        location: existing.location ?? person.location ?? null,
        sourceKinds,
        updatedAt,
      };
    };

    const existingSource = this.getSourceRef(person.sourceKind, person.sourceId, "person");
    if (existingSource) {
      const existing = this.getPerson(existingSource.entityId);
      if (existing) {
        const nextPrimaryHandle = existing.primaryHandle ?? normalizedPrimaryHandle;
        return persistDetails(existing, nextPrimaryHandle);
      }
    }

    const matchedPerson = this.findPersonByHandles(normalizedHandles);
    if (matchedPerson) {
      const nextPrimaryHandle = matchedPerson.primaryHandle ?? normalizedPrimaryHandle;
      const persisted = persistDetails(matchedPerson, nextPrimaryHandle);
      this.setSourceRef(person.sourceKind, person.sourceId, "person", matchedPerson.id);
      return persisted;
    }

    const persisted = this.getOrCreatePerson(normalizedPrimaryHandle ?? normalizedHandles[0] ?? null, person.displayName);
    const enriched = persistDetails(persisted, persisted.primaryHandle ?? normalizedPrimaryHandle ?? normalizedHandles[0] ?? null);
    this.setSourceRef(person.sourceKind, person.sourceId, "person", persisted.id);
    return enriched;
  }

  private findPersonByHandles(handles: string[]) {
    for (const handle of handles) {
      const row = this.db
        .prepare(`
          SELECT id, display_name AS displayName, primary_handle AS primaryHandle,
            email, phone, company_name AS companyName, job_title AS jobTitle, bio, location,
            source_kinds AS sourceKinds, created_at AS createdAt, updated_at AS updatedAt
          FROM people
          WHERE primary_handle = ? OR email = ? OR phone = ?
        `)
        .get(handle, handle, handle) as Record<string, unknown> | undefined;
      if (row) {
        return mapPerson(row);
      }
    }

    return null;
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

  private getSearchNavigation(kind: string, entityId: string) {
    if (kind === "thread") {
      const row = this.db
        .prepare("SELECT COALESCE(display_name, 'Message Thread') AS sourceLabel, last_message_at AS occurredAt FROM message_threads WHERE id = ?")
        .get(entityId) as { sourceLabel: string; occurredAt: number | null } | undefined;
      return { threadId: entityId, messageId: null, personId: null, sourceLabel: row?.sourceLabel ?? "Message Thread", occurredAt: row?.occurredAt ?? null };
    }
    if (kind === "message") {
      const row = this.db
        .prepare(`
          SELECT
            mm.thread_id AS threadId,
            mm.person_id AS personId,
            mm.occurred_at AS occurredAt,
            COALESCE(t.display_name, GROUP_CONCAT(mp.handle), 'Message Thread') AS sourceLabel
          FROM message_messages mm
          LEFT JOIN message_threads t ON t.id = mm.thread_id
          LEFT JOIN message_participants mp ON mp.thread_id = mm.thread_id
          WHERE mm.id = ?
          GROUP BY mm.id
        `)
        .get(entityId) as { threadId: string; personId: string | null; occurredAt: number; sourceLabel: string | null } | undefined;
      return {
        threadId: row?.threadId ?? null,
        messageId: entityId,
        personId: row?.personId ?? null,
        sourceLabel: row?.sourceLabel ?? "Message",
        occurredAt: row?.occurredAt ?? null,
      };
    }
    if (kind === "person") {
      const row = this.db
        .prepare("SELECT display_name AS sourceLabel, updated_at AS occurredAt FROM people WHERE id = ?")
        .get(entityId) as { sourceLabel: string; occurredAt: number } | undefined;
      return { threadId: null, messageId: null, personId: entityId, sourceLabel: row?.sourceLabel ?? "Person", occurredAt: row?.occurredAt ?? null };
    }
    if (kind === "reminder") {
      const row = this.db
        .prepare("SELECT person_id AS personId, title AS sourceLabel, due_at AS occurredAt FROM reminders WHERE id = ?")
        .get(entityId) as { personId: string | null; sourceLabel: string; occurredAt: number | null } | undefined;
      return { threadId: null, messageId: null, personId: row?.personId ?? null, sourceLabel: row?.sourceLabel ?? "Reminder", occurredAt: row?.occurredAt ?? null };
    }
    if (kind === "note") {
      const row = this.db
        .prepare("SELECT entity_type AS entityType, entity_id AS entityId, created_at AS occurredAt FROM notes WHERE id = ?")
        .get(entityId) as { entityType: string; entityId: string; occurredAt: number } | undefined;
      return {
        threadId: row?.entityType === "thread" ? row.entityId : null,
        messageId: null,
        personId: row?.entityType === "person" ? row.entityId : null,
        sourceLabel: "Note",
        occurredAt: row?.occurredAt ?? null,
      };
    }
    return { threadId: null, messageId: null, personId: null, sourceLabel: null, occurredAt: null };
  }

  private resultMatchesScope(result: SearchResult, scope?: SearchScope) {
    if (!scope || !scope.sourceScope || scope.sourceScope === "all") {
      return true;
    }

    if (scope.sourceScope === "thread") {
      return Boolean(scope.threadId) && result.threadId === scope.threadId;
    }

    if (scope.sourceScope === "person") {
      if (!scope.personId) return false;
      if (result.personId === scope.personId || result.entityId === scope.personId) return true;
      if (result.threadId) {
        const row = this.db
          .prepare("SELECT 1 AS ok FROM message_participants WHERE thread_id = ? AND person_id = ? LIMIT 1")
          .get(result.threadId, scope.personId) as { ok: number } | undefined;
        return Boolean(row);
      }
      return false;
    }

    return true;
  }

  search(query: string, limit = 10, queryEmbedding?: number[], scope?: SearchScope) {
    const safeQuery = normalizeQueryForFts(query);
    const textRows = safeQuery
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
          .all(safeQuery, limit * 8) as Array<Record<string, unknown>>)
      : [];

    const escapedQuery = query.replace(/[%_]/g, (char) => `\\${char}`);
    const fallbackRows = textRows.length === 0
      ? (this.db
          .prepare(`
            SELECT id, kind, entity_id AS entityId, title, content, embedding, 0 AS textScore
            FROM search_documents
            WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\'
            LIMIT ?
          `)
          .all(`%${escapedQuery}%`, `%${escapedQuery}%`, limit * 8) as Array<Record<string, unknown>>)
      : textRows;

    const semanticRows = queryEmbedding
      ? (this.db
          .prepare(`
            SELECT id, kind, entity_id AS entityId, title, content, embedding, NULL AS textScore
            FROM search_documents
            WHERE embedding IS NOT NULL AND embedding != ''
          `)
          .all() as Array<Record<string, unknown>>)
      : [];

    const byId = new Map<string, Record<string, unknown>>();
    for (const row of [...fallbackRows, ...semanticRows]) {
      byId.set(String(row.id), row);
    }

    const ranked = [...byId.values()].map((row) => {
      const embedding = parseEmbedding(row.embedding);
      const semanticScore = queryEmbedding && embedding ? cosineSimilarity(queryEmbedding, embedding) : 0;
      const keywordScore = Number(row.textScore ?? 0);
      const textScore = Number.isFinite(keywordScore) ? Math.max(0, -keywordScore) : 0;
      const combinedScore = semanticScore + textScore;
      const kind = String(row.kind) as SearchResult["kind"];
      const entityId = String(row.entityId);
      const navigation = this.getSearchNavigation(kind, entityId);

      return {
        id: String(row.id),
        kind,
        entityId,
        title: String(row.title),
        snippet: String(row.content).slice(0, 240),
        score: combinedScore,
        ...navigation,
      } satisfies SearchResult;
    });

    return ranked
      .sort((left, right) => right.score - left.score)
      .filter((result) => this.resultMatchesScope(result, scope))
      .slice(0, limit);
  }

  getEmbeddingSyncStatus() {
    const row = this.db
      .prepare(`
        SELECT
          COUNT(*) AS totalDocuments,
          SUM(CASE WHEN embedding IS NOT NULL AND embedding != '' THEN 1 ELSE 0 END) AS embeddedDocuments,
          SUM(CASE WHEN dirty = 1 THEN 1 ELSE 0 END) AS dirtyDocuments,
          MAX(embedding_provider) AS provider,
          MAX(embedding_model) AS model
        FROM search_documents
      `)
      .get() as Record<string, unknown>;

    return {
      totalDocuments: Number(row.totalDocuments ?? 0),
      embeddedDocuments: Number(row.embeddedDocuments ?? 0),
      dirtyDocuments: Number(row.dirtyDocuments ?? 0),
      provider: (row.provider as SearchDocumentRecord["embeddingProvider"]) ?? null,
      model: (row.model as string | null) ?? null,
      syncing: false,
      lastError: null,
    };
  }

  getSearchScaleStatus(options?: { vectorScanWarningThreshold?: number }) {
    const threshold = options?.vectorScanWarningThreshold ?? 50_000;
    const row = this.db
      .prepare(`
        SELECT
          COUNT(*) AS totalDocuments,
          SUM(CASE WHEN embedding IS NOT NULL AND embedding != '' THEN 1 ELSE 0 END) AS embeddedDocuments,
          SUM(CASE WHEN dirty = 1 THEN 1 ELSE 0 END) AS dirtyDocuments
        FROM search_documents
      `)
      .get() as Record<string, unknown>;

    const embeddedDocuments = Number(row.embeddedDocuments ?? 0);
    return {
      totalDocuments: Number(row.totalDocuments ?? 0),
      embeddedDocuments,
      dirtyDocuments: Number(row.dirtyDocuments ?? 0),
      vectorScanWarningThreshold: threshold,
      recommendVectorIndex: embeddedDocuments >= threshold,
      estimatedVectorBytes: embeddedDocuments * 384 * 4,
    };
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
        FROM message_messages mm
        JOIN message_threads t ON t.id = mm.thread_id
        WHERE mm.body IS NOT NULL
          AND (
            mm.person_id = ?
            OR (
              mm.is_from_me = 1
              AND t.participant_count <= 2
              AND EXISTS (
                SELECT 1 FROM message_participants mp
                WHERE mp.thread_id = mm.thread_id AND mp.person_id = ?
              )
            )
          )
      `)
      .get(personId, personId, personId, personId) as Record<string, unknown>;

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

  /**
   * Execute a raw read-only SQL query with parameters.
   * Used by AnalyticsEngine for analytics queries.
   */
  query<T = Record<string, unknown>>(sql: string, ...params: Array<string | number | bigint | Buffer | null>): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  getThreadDetail(threadId: string) {
    const thread = this.db
      .prepare(`
        SELECT id, source_chat_id AS sourceChatId, display_name AS displayName,
               participant_count AS participantCount, last_message_at AS lastMessageAt
        FROM message_threads WHERE id = ?
      `)
      .get(threadId) as MessageThread | undefined;

    if (!thread) return null;

    const participants = this.db
      .prepare(`
        SELECT mp.person_id AS personId, p.display_name AS displayName, mp.handle
        FROM message_participants mp
        LEFT JOIN people p ON p.id = mp.person_id
        WHERE mp.thread_id = ?
      `)
      .all(threadId) as Array<{ personId: string; displayName: string; handle: string }>;

    const totalMessageCount = this.db
      .prepare("SELECT COUNT(*) AS count FROM message_messages WHERE thread_id = ?")
      .get(threadId) as { count: number };

    return {
      thread,
      participants,
      totalMessageCount: totalMessageCount.count,
    };
  }

  private getMessageAttachments(messageIds: string[]) {
    if (messageIds.length === 0) {
      return new Map<string, MessageAttachment[]>();
    }

    const placeholders = messageIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`
        SELECT
          id,
          message_id AS messageId,
          path,
          mime_type AS mimeType,
          transfer_name AS transferName
        FROM attachment_refs
        WHERE message_id IN (${placeholders})
        ORDER BY id ASC
      `)
      .all(...messageIds) as Array<Record<string, unknown>>;

    const attachments = new Map<string, MessageAttachment[]>();
    for (const row of rows) {
      const messageId = String(row.messageId);
      const list = attachments.get(messageId) ?? [];
      list.push({
        id: String(row.id),
        path: (row.path as string | null) ?? null,
        mimeType: (row.mimeType as string | null) ?? null,
        transferName: (row.transferName as string | null) ?? null,
      });
      attachments.set(messageId, list);
    }

    return attachments;
  }

  private mapMessageRows(rows: Array<Record<string, unknown>>): MessageDetail[] {
    const attachments = this.getMessageAttachments(rows.map((row) => String(row.id)));
    return rows.map((row) => {
      const id = String(row.id);
      return {
        id,
        threadId: String(row.threadId),
        personId: (row.personId as string | null) ?? null,
        body: (row.body as string | null) ?? null,
        occurredAt: Number(row.occurredAt),
        isFromMe: Boolean(row.isFromMe),
        hasAttachments: Boolean(row.hasAttachments),
        attachments: attachments.get(id) ?? [],
      };
    });
  }

  getThreadMessages(threadId: string, limit = 50, offset = 0, aroundMessageId?: string | null) {
    let resolvedOffset = offset;
    if (aroundMessageId) {
      const anchor = this.db
        .prepare("SELECT id, occurred_at AS occurredAt FROM message_messages WHERE thread_id = ? AND id = ?")
        .get(threadId, aroundMessageId) as { id: string; occurredAt: number } | undefined;

      if (anchor) {
        const newerCount = this.db
          .prepare(`
            SELECT COUNT(*) AS count
            FROM message_messages
            WHERE thread_id = ?
              AND (occurred_at > ? OR (occurred_at = ? AND id > ?))
          `)
          .get(threadId, anchor.occurredAt, anchor.occurredAt, anchor.id) as { count: number };
        resolvedOffset = Math.max(0, newerCount.count - Math.floor(limit / 2));
      }
    }

    const rows = this.db
      .prepare(`
        SELECT
          mm.id, mm.thread_id AS threadId, mm.person_id AS personId,
          mm.body, mm.occurred_at AS occurredAt, mm.is_from_me AS isFromMe,
          mm.has_attachments AS hasAttachments
        FROM message_messages mm
        WHERE mm.thread_id = ?
        ORDER BY mm.occurred_at DESC, mm.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(threadId, limit, resolvedOffset) as Array<Record<string, unknown>>;

    return this.mapMessageRows(rows);
  }

  listThreadsPaginated(limit = 50, offset = 0) {
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
          t.last_message_at AS lastMessageAt,
          t.participant_count AS participantCount
        FROM message_threads t
        LEFT JOIN message_participants mp ON mp.thread_id = t.id
        GROUP BY t.id
        ORDER BY t.last_message_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(limit, offset) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      threadId: String(row.threadId),
      title: String(row.title ?? "Untitled Thread"),
      participantHandles: String(row.participantHandles ?? "").split(",").filter(Boolean),
      lastMessagePreview: (row.lastMessagePreview as string | null) ?? null,
      lastMessageAt: (row.lastMessageAt as number | null) ?? null,
      participantCount: Number(row.participantCount ?? 0),
    }));
  }

  listPeopleForPicker(limit = 100, query?: string) {
    const filter = query?.trim();
    const rows = filter
      ? this.db
          .prepare(`
            SELECT id, display_name AS displayName, primary_handle AS primaryHandle,
              email, phone, company_name AS companyName, job_title AS jobTitle, bio, location,
              source_kinds AS sourceKinds, created_at AS createdAt, updated_at AS updatedAt
            FROM people
            WHERE display_name LIKE ? OR primary_handle LIKE ? OR email LIKE ? OR phone LIKE ?
              OR EXISTS (
                SELECT 1 FROM person_aliases pa
                WHERE pa.person_id = people.id AND pa.value LIKE ?
              )
            ORDER BY updated_at DESC
            LIMIT ?
          `)
          .all(`%${filter}%`, `%${filter}%`, `%${filter}%`, `%${filter}%`, `%${filter}%`, limit)
      : this.db
          .prepare(`
            SELECT id, display_name AS displayName, primary_handle AS primaryHandle,
              email, phone, company_name AS companyName, job_title AS jobTitle, bio, location,
              source_kinds AS sourceKinds, created_at AS createdAt, updated_at AS updatedAt
            FROM people
            ORDER BY updated_at DESC
            LIMIT ?
          `)
          .all(limit);
    return (rows as Array<Record<string, unknown>>).map(mapPerson);
  }

  getPersonThreads(personId: string, limit = 10) {
    const rows = this.db
      .prepare(`
        SELECT
          t.id AS threadId,
          COALESCE(t.display_name, GROUP_CONCAT(DISTINCT allp.handle)) AS title,
          GROUP_CONCAT(DISTINCT allp.handle) AS participantHandles,
          (
            SELECT body FROM message_messages mm
            WHERE mm.thread_id = t.id
            ORDER BY occurred_at DESC
            LIMIT 1
          ) AS lastMessagePreview,
          t.last_message_at AS lastMessageAt,
          t.participant_count AS participantCount
        FROM message_threads t
        JOIN message_participants target ON target.thread_id = t.id AND target.person_id = ?
        LEFT JOIN message_participants allp ON allp.thread_id = t.id
        GROUP BY t.id
        ORDER BY t.last_message_at DESC
        LIMIT ?
      `)
      .all(personId, limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      threadId: String(row.threadId),
      title: String(row.title ?? "Untitled Thread"),
      participantHandles: String(row.participantHandles ?? "").split(",").filter(Boolean),
      lastMessagePreview: (row.lastMessagePreview as string | null) ?? null,
      lastMessageAt: (row.lastMessageAt as number | null) ?? null,
      participantCount: Number(row.participantCount ?? 0),
    }));
  }

  getPersonRecentMessages(personId: string, limit = 20): MessageDetail[] {
    const rows = this.db
      .prepare(`
        SELECT
          mm.id, mm.thread_id AS threadId, mm.person_id AS personId,
          mm.body, mm.occurred_at AS occurredAt, mm.is_from_me AS isFromMe,
          mm.has_attachments AS hasAttachments
        FROM message_messages mm
        WHERE mm.body IS NOT NULL
          AND (
            mm.person_id = ?
            OR (
              mm.is_from_me = 1
              AND EXISTS (
                SELECT 1 FROM message_participants mp
                WHERE mp.thread_id = mm.thread_id AND mp.person_id = ?
              )
            )
          )
        ORDER BY mm.occurred_at DESC
        LIMIT ?
      `)
      .all(personId, personId, limit) as Array<Record<string, unknown>>;

    return this.mapMessageRows(rows);
  }

  searchPersonMessages(personId: string, query = "", limit = 25, offset = 0): MessageDetail[] {
    const filter = query.trim();
    const escaped = filter.replace(/[%_]/g, (char) => `\\${char}`);
    const params: Array<string | number> = [personId, personId];
    let bodyFilter = "";
    if (filter) {
      bodyFilter = "AND mm.body LIKE ? ESCAPE '\\'";
      params.push(`%${escaped}%`);
    }
    params.push(limit, offset);

    const rows = this.db
      .prepare(`
        SELECT
          mm.id, mm.thread_id AS threadId, mm.person_id AS personId,
          mm.body, mm.occurred_at AS occurredAt, mm.is_from_me AS isFromMe,
          mm.has_attachments AS hasAttachments
        FROM message_messages mm
        WHERE mm.body IS NOT NULL
          AND (
            mm.person_id = ?
            OR (
              mm.is_from_me = 1
              AND EXISTS (
                SELECT 1 FROM message_participants mp
                WHERE mp.thread_id = mm.thread_id AND mp.person_id = ?
              )
            )
          )
          ${bodyFilter}
        ORDER BY mm.occurred_at DESC, mm.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params) as Array<Record<string, unknown>>;

    return this.mapMessageRows(rows);
  }

  getPersonNotes(personId: string): Note[] {
    const rows = this.db
      .prepare(`
        SELECT
          id,
          entity_type AS entityType,
          entity_id AS entityId,
          content,
          pinned,
          pinned_at AS pinnedAt,
          created_at AS createdAt
        FROM notes
        WHERE entity_type = 'person' AND entity_id = ?
        ORDER BY pinned DESC, COALESCE(pinned_at, created_at) DESC, created_at DESC
      `)
      .all(personId) as Array<Record<string, unknown>>;
    return rows.map(mapNote);
  }

  getPersonReminders(personId: string): Reminder[] {
    const rows = this.db
      .prepare("SELECT id, title, person_id AS personId, due_at AS dueAt, status, created_at AS createdAt FROM reminders WHERE person_id = ? ORDER BY status ASC, created_at DESC")
      .all(personId) as Array<Record<string, unknown>>;
    return rows.map(mapReminder);
  }

  getNote(noteId: string): Note | null {
    const row = this.db
      .prepare(`
        SELECT id, entity_type AS entityType, entity_id AS entityId, content, pinned, pinned_at AS pinnedAt, created_at AS createdAt
        FROM notes
        WHERE id = ?
      `)
      .get(noteId) as Record<string, unknown> | undefined;
    return row ? mapNote(row) : null;
  }

  setNotePinned(noteId: string, pinned: boolean): Note | null {
    this.db
      .prepare("UPDATE notes SET pinned = ?, pinned_at = ? WHERE id = ?")
      .run(pinned ? 1 : 0, pinned ? now() : null, noteId);
    return this.getNote(noteId);
  }

  getReminder(reminderId: string): Reminder | null {
    const row = this.db
      .prepare("SELECT id, title, person_id AS personId, due_at AS dueAt, status, created_at AS createdAt FROM reminders WHERE id = ?")
      .get(reminderId) as Record<string, unknown> | undefined;
    return row ? mapReminder(row) : null;
  }

  updateReminderStatus(reminderId: string, status: Reminder["status"]): Reminder | null {
    this.db
      .prepare("UPDATE reminders SET status = ? WHERE id = ?")
      .run(status, reminderId);
    return this.getReminder(reminderId);
  }

  private relationshipSummary(stats: PersonProfile["stats"], digest: RelationshipDigest): PersonProfile["summary"] {
    const total = stats?.totalMessages ?? digest.messageCount;
    const cadenceLabel = total > 0 && stats?.firstMessageAt && stats.lastMessageAt
      ? (() => {
          const spanDays = Math.max(1, Math.ceil((stats.lastMessageAt - stats.firstMessageAt) / 86_400_000));
          const messagesPerWeek = total / Math.max(1, spanDays / 7);
          if (messagesPerWeek >= 10) return "High cadence";
          if (messagesPerWeek >= 2) return "Regular cadence";
          return "Occasional cadence";
        })()
      : "No cadence yet";
    const sentReceivedLabel = stats
      ? `${stats.sentByMe} sent / ${stats.sentByThem} received`
      : "No message balance yet";
    const responseLabel = stats?.avgResponseTimeMs
      ? `Typical response ${Math.round(stats.avgResponseTimeMs / 60_000)} min`
      : "Response signal unavailable";

    return {
      firstContactAt: stats?.firstMessageAt ?? null,
      lastContactAt: stats?.lastMessageAt ?? digest.lastContactAt,
      cadenceLabel,
      sentReceivedLabel,
      responseLabel,
    };
  }

  getPersonProfile(personId: string, stats: PersonProfile["stats"] = null): PersonProfile | null {
    const person = this.getPerson(personId);
    const digest = this.relationshipDigest(personId);
    if (!person || !digest) {
      return null;
    }

    return {
      person,
      aliases: this.getPersonAliases(personId),
      digest,
      stats,
      summary: this.relationshipSummary(stats, digest),
      threads: this.getPersonThreads(personId, 12),
      recentMessages: this.getPersonRecentMessages(personId, 25),
      notes: this.getPersonNotes(personId),
      reminders: this.getPersonReminders(personId),
    };
  }

  close() {
    this.db.close();
  }
}
