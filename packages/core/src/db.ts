import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";
import type {
  ConnectorSyncResult,
  EditablePersonProfile,
  EmbeddingPlanStats,
  EmbeddingPriority,
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
  SearchQueryInput,
  SearchResult,
  SearchResultType,
  ConversationCitationContext,
  SourceKind,
} from "@openfolio/shared-types";
import {
  buildMessageSearchContent,
  buildNoteSearchContent,
  buildPersonSearchContent,
  buildReminderSearchContent,
  buildThreadSearchContent,
} from "./embeddings.js";
import { contentHash, createId, normalizeHandle, normalizeQueryForFts, now } from "./utils.js";

const DEFAULT_DB_DIR = path.join(os.homedir(), "Library", "Application Support", "OpenFolio");
const CURRENT_SCHEMA_VERSION = 4;

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

const DEFAULT_EMBEDDING_PRIORITY: EmbeddingPriority = {
  startAt: null,
  endAt: null,
  personIds: [],
};

function normalizeEmbeddingPriority(value: unknown): EmbeddingPriority {
  if (!value || typeof value !== "object") return { ...DEFAULT_EMBEDDING_PRIORITY };
  const input = value as Partial<EmbeddingPriority>;
  return {
    startAt: typeof input.startAt === "number" && Number.isFinite(input.startAt) ? input.startAt : null,
    endAt: typeof input.endAt === "number" && Number.isFinite(input.endAt) ? input.endAt : null,
    personIds: Array.isArray(input.personIds)
      ? [...new Set(input.personIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
      : [],
  };
}

function buildMessagePriorityPredicate(priority: EmbeddingPriority, messageAlias = "mm") {
  const clauses: string[] = [];
  const args: Array<string | number> = [];
  if (priority.startAt != null) {
    clauses.push(`${messageAlias}.occurred_at >= ?`);
    args.push(priority.startAt);
  }
  if (priority.endAt != null) {
    clauses.push(`${messageAlias}.occurred_at < ?`);
    args.push(priority.endAt);
  }
  const dateClause = clauses.length > 0 ? `(${clauses.join(" AND ")})` : null;
  const peopleClause = priority.personIds.length > 0
    ? `EXISTS (
        SELECT 1 FROM message_participants priority_participant
        WHERE priority_participant.thread_id = ${messageAlias}.thread_id
          AND priority_participant.person_id IN (${priority.personIds.map(() => "?").join(", ")})
      )`
    : null;
  if (peopleClause) args.push(...priority.personIds);
  return {
    sql: [dateClause, peopleClause].filter(Boolean).join(" OR ") || "1 = 1",
    args,
  };
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

const PRIMARY_SEARCH_RESULT_TYPES: SearchResultType[] = ["message", "person", "conversation"];

function resultTypeForKind(kind: SearchResult["kind"]): SearchResultType | null {
  if (kind === "thread") return "conversation";
  if (kind === "person") return "person";
  if (kind === "message") return "message";
  return null;
}

type SearchTargets = {
  people?: string[];
  threads?: string[];
  messages?: string[];
  notes?: string[];
  reminders?: string[];
};

type SearchNavigation = {
  threadId: string | null;
  messageId: string | null;
  personId: string | null;
  personLabel: string | null;
  senderLabel: string | null;
  direction: SearchResult["direction"];
  sourceLabel: string | null;
  primaryLabel: string;
  occurredAt: number | null;
  snippet: string | null;
};

export class OpenFolioDatabase {
  readonly dbPath: string;

  private readonly db: DatabaseSync;

  constructor(
    dbPath = process.env.OPENFOLIO_LOCAL_DB_PATH || path.join(DEFAULT_DB_DIR, "openfolio.sqlite"),
    options?: { readOnly?: boolean },
  ) {
    if (!options?.readOnly) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath, { allowExtension: true, readOnly: options?.readOnly ?? false });
    const sqliteVectorPath = sqliteVec
      .getLoadablePath()
      .replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
    this.db.loadExtension(sqliteVectorPath);
    this.db.enableLoadExtension(false);
    this.db.exec(options?.readOnly
      ? "PRAGMA busy_timeout = 5000; PRAGMA mmap_size = 536870912; PRAGMA cache_size = -65536;"
      : "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA mmap_size = 536870912; PRAGMA cache_size = -65536;");
    if (options?.readOnly) return;
    this.migrateSchema();
    this.bootstrap();
  }

  private migrateSchema() {
    const version = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    const hasExistingTables = (this.db
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .get() as { count: number }).count > 0;

    if (!hasExistingTables) {
      return;
    }

    if (version.user_version > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `This OpenFolio database was created by a newer version and uses schema ${version.user_version}. This app only supports schema ${CURRENT_SCHEMA_VERSION}. Update OpenFolio before opening this database.`,
      );
    }

    if (version.user_version === CURRENT_SCHEMA_VERSION) {
      return;
    }

    this.backupBeforeMigration(version.user_version);
    this.runMigrations(version.user_version, CURRENT_SCHEMA_VERSION);
  }

  private backupBeforeMigration(fromVersion: number) {
    this.db.exec("PRAGMA wal_checkpoint(FULL);");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(path.dirname(this.dbPath), "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const baseName = path.basename(this.dbPath);
    const backupBasePath = path.join(backupDir, `${baseName}.before-schema-${fromVersion}-to-${CURRENT_SCHEMA_VERSION}.${timestamp}`);
    for (const suffix of ["", "-wal", "-shm"]) {
      const sourcePath = `${this.dbPath}${suffix}`;
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, `${backupBasePath}${suffix}`);
      }
    }
  }

  private runMigrations(fromVersion: number, toVersion: number) {
    let currentVersion = fromVersion;
    this.db.exec("BEGIN;");
    try {
      while (currentVersion < toVersion) {
        const nextVersion = currentVersion + 1;
        this.runMigrationStep(currentVersion, nextVersion);
        currentVersion = nextVersion;
      }
      this.db.exec(`PRAGMA user_version = ${toVersion};`);
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  private runMigrationStep(fromVersion: number, toVersion: number) {
    if (fromVersion === 3 && toVersion === 4) {
      this.db.exec(`
        DROP TRIGGER IF EXISTS search_documents_vector_bu;
        DROP TRIGGER IF EXISTS search_documents_vector_au_insert;
        DROP TABLE IF EXISTS search_document_binary_vectors;
        DROP TABLE IF EXISTS search_document_binary_vector_rows;
      `);
      return;
    }
    if (toVersion <= CURRENT_SCHEMA_VERSION) {
      this.resetDerivedSearchState();
      return;
    }

    throw new Error(`No OpenFolio migration is available from schema ${fromVersion} to ${toVersion}.`);
  }

  private resetDerivedSearchState() {
    this.db.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TRIGGER IF EXISTS search_documents_ai;
      DROP TRIGGER IF EXISTS search_documents_ad;
      DROP TRIGGER IF EXISTS search_documents_au;
      DROP TABLE IF EXISTS search_documents_fts;
      PRAGMA foreign_keys = ON;
    `);
    if (this.tableExists("search_documents")) {
      this.db.exec("DELETE FROM search_documents;");
    }
  }

  private tableExists(tableName: string) {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) as { count: number };
    return row.count > 0;
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

      CREATE INDEX IF NOT EXISTS search_documents_dirty_updated_idx
      ON search_documents(dirty, updated_at DESC);

      CREATE INDEX IF NOT EXISTS message_messages_occurred_at_idx
      ON message_messages(occurred_at DESC);

      CREATE INDEX IF NOT EXISTS message_participants_person_thread_idx
      ON message_participants(person_id, thread_id);

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

      DROP TRIGGER IF EXISTS search_documents_au;
      CREATE TRIGGER search_documents_au AFTER UPDATE OF title, content ON search_documents BEGIN
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
    this.ensureSearchDocumentColumn("embedding_priority", "INTEGER NOT NULL DEFAULT 1");
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS search_documents_embedding_queue_idx
      ON search_documents(dirty, embedding_priority, updated_at DESC);
    `);
    this.ensureSearchVectorIndex();
    this.db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION};`);
  }

  private ensureSearchVectorIndex() {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_document_vectors
      USING vec0(embedding float[384] distance_metric=cosine);

      CREATE TABLE IF NOT EXISTS search_document_vector_rows (
        document_rowid INTEGER PRIMARY KEY
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS search_document_binary_vectors
      USING vec0(embedding bit[384], kind TEXT);

      CREATE TABLE IF NOT EXISTS search_document_binary_vector_rows (
        document_rowid INTEGER PRIMARY KEY
      );

      DROP TRIGGER IF EXISTS search_documents_vector_ai;
      CREATE TRIGGER search_documents_vector_ai
      AFTER INSERT ON search_documents
      WHEN new.embedding IS NOT NULL AND length(new.embedding) > 0
      BEGIN
        INSERT INTO search_document_vectors(rowid, embedding)
        VALUES (new.rowid, new.embedding);
        INSERT INTO search_document_vector_rows(document_rowid)
        VALUES (new.rowid);
        INSERT INTO search_document_binary_vectors(rowid, embedding, kind)
        VALUES (new.rowid, vec_quantize_binary(vec_f32(new.embedding)), new.kind);
        INSERT INTO search_document_binary_vector_rows(document_rowid)
        VALUES (new.rowid);
      END;

      DROP TRIGGER IF EXISTS search_documents_vector_au;
      DROP TRIGGER IF EXISTS search_documents_vector_bu;
      CREATE TRIGGER search_documents_vector_bu
      BEFORE UPDATE OF embedding ON search_documents
      BEGIN
        DELETE FROM search_document_vectors WHERE rowid = old.rowid;
        DELETE FROM search_document_vector_rows WHERE document_rowid = old.rowid;
        DELETE FROM search_document_binary_vectors WHERE rowid = old.rowid;
        DELETE FROM search_document_binary_vector_rows WHERE document_rowid = old.rowid;
      END;

      DROP TRIGGER IF EXISTS search_documents_vector_au_insert;
      CREATE TRIGGER search_documents_vector_au_insert
      AFTER UPDATE OF embedding ON search_documents
      WHEN new.embedding IS NOT NULL AND length(new.embedding) > 0
      BEGIN
        INSERT INTO search_document_vectors(rowid, embedding)
        VALUES (new.rowid, new.embedding);
        INSERT INTO search_document_vector_rows(document_rowid)
        VALUES (new.rowid);
        INSERT INTO search_document_binary_vectors(rowid, embedding, kind)
        VALUES (new.rowid, vec_quantize_binary(vec_f32(new.embedding)), new.kind);
        INSERT INTO search_document_binary_vector_rows(document_rowid)
        VALUES (new.rowid);
      END;

      DROP TRIGGER IF EXISTS search_documents_vector_ad;
      CREATE TRIGGER search_documents_vector_ad
      AFTER DELETE ON search_documents
      BEGIN
        DELETE FROM search_document_vectors WHERE rowid = old.rowid;
        DELETE FROM search_document_vector_rows WHERE document_rowid = old.rowid;
        DELETE FROM search_document_binary_vectors WHERE rowid = old.rowid;
        DELETE FROM search_document_binary_vector_rows WHERE document_rowid = old.rowid;
      END;
    `);
    this.reconcileSearchVectorRows();
    this.reconcileSearchBinaryVectorRows();
  }

  backfillSearchVectorIndex(limit = 250) {
    const normalizedLimit = Math.max(1, Math.min(2_000, Math.floor(limit)));
    const loadCandidates = () => {
      const storedCursor = Number(this.getSetting("search_vector_backfill_cursor") ?? 0);
      const cursor = Number.isSafeInteger(storedCursor) && storedCursor >= 0 ? storedCursor : 0;
      return this.db
        .prepare(`
        SELECT d.rowid AS documentRowid, d.embedding
        FROM search_documents d
        LEFT JOIN search_document_vector_rows vector_rows
          ON vector_rows.document_rowid = d.rowid
        WHERE d.embedding IS NOT NULL
          AND length(d.embedding) > 0
          AND d.rowid > ?
          AND vector_rows.document_rowid IS NULL
        ORDER BY d.rowid ASC
        LIMIT ?
      `)
        .all(cursor, normalizedLimit) as Array<{ documentRowid: number; embedding: string }>;
    };

    let candidates = loadCandidates();
    if (candidates.length === 0) {
      let shouldRetry = this.reconcileSearchVectorRows();
      if (!shouldRetry) {
        const status = this.getSearchVectorIndexStatus();
        const storedCursor = Number(this.getSetting("search_vector_backfill_cursor") ?? 0);
        if (status.embeddedDocuments > status.indexedDocuments && storedCursor > 0) {
          this.setSetting("search_vector_backfill_cursor", "0");
          shouldRetry = true;
        }
      }
      if (shouldRetry) candidates = loadCandidates();
    }
    if (candidates.length === 0) return 0;

    const insertVector = this.db.prepare(
      "INSERT INTO search_document_vectors(rowid, embedding) VALUES (?, ?)",
    );
    const markIndexed = this.db.prepare(
      "INSERT INTO search_document_vector_rows(document_rowid) VALUES (?)",
    );

    this.db.exec("BEGIN;");
    try {
      for (const candidate of candidates) {
        // sqlite-vec requires virtual-table primary keys to be bound as
        // 64-bit integers rather than JavaScript numbers.
        insertVector.run(BigInt(candidate.documentRowid), candidate.embedding);
        markIndexed.run(candidate.documentRowid);
      }
      this.setSetting(
        "search_vector_backfill_cursor",
        String(candidates[candidates.length - 1]!.documentRowid),
      );
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
    return candidates.length;
  }

  backfillSearchBinaryVectorIndex(limit = 500) {
    const normalizedLimit = Math.max(1, Math.min(2_000, Math.floor(limit)));
    const loadCandidates = () => {
      const storedCursor = Number(this.getSetting("search_binary_vector_backfill_cursor") ?? 0);
      const cursor = Number.isSafeInteger(storedCursor) && storedCursor >= 0 ? storedCursor : 0;
      return this.db.prepare(`
        SELECT d.rowid AS documentRowid, d.embedding, d.kind
        FROM search_documents d
        LEFT JOIN search_document_binary_vector_rows vector_rows
          ON vector_rows.document_rowid = d.rowid
        WHERE d.embedding IS NOT NULL
          AND length(d.embedding) > 0
          AND d.rowid > ?
          AND vector_rows.document_rowid IS NULL
        ORDER BY d.rowid ASC
        LIMIT ?
      `)
        .all(cursor, normalizedLimit) as Array<{ documentRowid: number; embedding: string; kind: string }>;
    };
    let candidates = loadCandidates();
    if (candidates.length === 0) {
      let shouldRetry = this.reconcileSearchBinaryVectorRows();
      if (!shouldRetry) {
        const status = this.getSearchBinaryVectorIndexStatus();
        const storedCursor = Number(this.getSetting("search_binary_vector_backfill_cursor") ?? 0);
        if (status.embeddedDocuments > status.indexedDocuments && storedCursor > 0) {
          this.setSetting("search_binary_vector_backfill_cursor", "0");
          shouldRetry = true;
        }
      }
      if (shouldRetry) candidates = loadCandidates();
    }
    if (candidates.length === 0) return 0;

    const insertVector = this.db.prepare(
      "INSERT INTO search_document_binary_vectors(rowid, embedding, kind) VALUES (?, vec_quantize_binary(?), ?)",
    );
    const markIndexed = this.db.prepare(
      "INSERT INTO search_document_binary_vector_rows(document_rowid) VALUES (?)",
    );
    this.db.exec("BEGIN;");
    try {
      for (const candidate of candidates) {
        insertVector.run(BigInt(candidate.documentRowid), candidate.embedding, candidate.kind);
        markIndexed.run(candidate.documentRowid);
      }
      this.setSetting(
        "search_binary_vector_backfill_cursor",
        String(candidates[candidates.length - 1]!.documentRowid),
      );
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
    return candidates.length;
  }

  private reconcileSearchVectorRows() {
    const counts = this.db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM search_document_vectors) AS vectorCount,
          (SELECT COUNT(*) FROM search_document_vector_rows) AS markerCount
      `)
      .get() as { vectorCount: number; markerCount: number };
    if (Number(counts.vectorCount) === Number(counts.markerCount)) return false;

    this.db.exec("BEGIN;");
    try {
      this.db.exec(`
        DELETE FROM search_document_vector_rows;
        INSERT INTO search_document_vector_rows(document_rowid)
        SELECT rowid FROM search_document_vectors;
      `);
      this.setSetting("search_vector_backfill_cursor", "0");
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
    return true;
  }

  private reconcileSearchBinaryVectorRows() {
    const counts = this.db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM search_document_binary_vectors) AS vectorCount,
          (SELECT COUNT(*) FROM search_document_binary_vector_rows) AS markerCount
      `)
      .get() as { vectorCount: number; markerCount: number };
    if (Number(counts.vectorCount) === Number(counts.markerCount)) return false;
    this.db.exec(`
      DELETE FROM search_document_binary_vector_rows;
      INSERT INTO search_document_binary_vector_rows(document_rowid)
      SELECT rowid FROM search_document_binary_vectors;
    `);
    this.setSetting("search_binary_vector_backfill_cursor", "0");
    return true;
  }

  getSearchBinaryVectorIndexStatus() {
    const row = this.db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM search_documents WHERE dirty = 0) AS embeddedDocuments,
          (SELECT COUNT(*) FROM search_document_binary_vector_rows) AS indexedDocuments
      `)
      .get() as { embeddedDocuments: number; indexedDocuments: number };
    return {
      embeddedDocuments: Number(row.embeddedDocuments),
      indexedDocuments: Number(row.indexedDocuments),
    };
  }

  getSearchVectorIndexStatus() {
    const row = this.db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM search_documents WHERE dirty = 0) AS embeddedDocuments,
          (SELECT COUNT(*) FROM search_document_vector_rows) AS indexedDocuments
      `)
      .get() as { embeddedDocuments: number; indexedDocuments: number };
    return {
      embeddedDocuments: Number(row.embeddedDocuments),
      indexedDocuments: Number(row.indexedDocuments),
    };
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

  getEmbeddingPriority(): EmbeddingPriority {
    const stored = this.getSetting("embedding_priority");
    if (!stored) return { ...DEFAULT_EMBEDDING_PRIORITY };
    try {
      return normalizeEmbeddingPriority(JSON.parse(stored));
    } catch {
      return { ...DEFAULT_EMBEDDING_PRIORITY };
    }
  }

  setEmbeddingPriority(priority: EmbeddingPriority) {
    const normalized = normalizeEmbeddingPriority(priority);
    this.setSetting("embedding_priority", JSON.stringify(normalized));
    this.setSetting("embedding_priority_applied", "");
    return normalized;
  }

  invalidateEmbeddingPriority() {
    this.setSetting("embedding_priority_applied", "");
  }

  applyEmbeddingPriority() {
    const priority = this.getEmbeddingPriority();
    const serialized = JSON.stringify(priority);
    if (this.getSetting("embedding_priority_applied") === serialized) return;

    const predicate = buildMessagePriorityPredicate(priority);
    this.db.exec("BEGIN;");
    try {
      this.db.prepare("UPDATE search_documents SET embedding_priority = 1 WHERE dirty = 1 AND embedding_priority != 1").run();
      this.db.prepare("UPDATE search_documents SET embedding_priority = 0 WHERE dirty = 1 AND kind != 'message' AND embedding_priority != 0").run();
      this.db
        .prepare(`
          UPDATE search_documents
          SET embedding_priority = 0
          WHERE dirty = 1 AND kind = 'message' AND embedding_priority != 0 AND EXISTS (
            SELECT 1 FROM message_messages mm
            WHERE mm.id = search_documents.entity_id AND (${predicate.sql})
          )
        `)
        .run(...predicate.args);
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
    this.setSetting("embedding_priority_applied", serialized);
  }

  getEmbeddingPlanStats(documentsPerSecond: number | null): EmbeddingPlanStats {
    const priority = this.getEmbeddingPriority();
    const predicate = buildMessagePriorityPredicate(priority);
    const bounds = this.db
      .prepare(`
        SELECT MIN(occurred_at) AS earliestMessageAt, MAX(occurred_at) AS latestMessageAt
        FROM message_messages
        WHERE body IS NOT NULL AND body != ''
      `)
      .get() as Record<string, unknown>;
    const selected = this.db
      .prepare(`
        SELECT COUNT(*) AS selectedMessages, COUNT(DISTINCT mm.thread_id) AS selectedConversations
        FROM message_messages mm
        WHERE mm.body IS NOT NULL AND mm.body != '' AND (${predicate.sql})
      `)
      .get(...predicate.args) as Record<string, unknown>;
    const coverage = this.db
      .prepare(`
        SELECT
          SUM(CASE WHEN d.dirty = 1 THEN 1 ELSE 0 END) AS selectedDirtyDocuments,
          SUM(CASE WHEN d.embedding IS NOT NULL AND d.embedding != '' THEN 1 ELSE 0 END) AS selectedEmbeddedDocuments
        FROM search_documents d
        JOIN message_messages mm ON d.kind = 'message' AND d.entity_id = mm.id
        WHERE ${predicate.sql}
      `)
      .get(...predicate.args) as Record<string, unknown>;
    const timeline = this.db
      .prepare(`
        SELECT
          strftime('%Y-%m', occurred_at / 1000, 'unixepoch') AS month,
          CAST(strftime('%s', strftime('%Y-%m-01', occurred_at / 1000, 'unixepoch')) AS INTEGER) * 1000 AS startAt,
          COUNT(*) AS count
        FROM message_messages
        WHERE body IS NOT NULL AND body != ''
        GROUP BY month
        ORDER BY month ASC
      `)
      .all()
      .map((row) => ({
        month: String((row as Record<string, unknown>).month),
        startAt: Number((row as Record<string, unknown>).startAt),
        count: Number((row as Record<string, unknown>).count),
      }));
    const people = this.db
      .prepare(`
        SELECT p.id, p.display_name AS displayName, COUNT(DISTINCT mm.id) AS messageCount
        FROM people p
        JOIN message_participants mp ON mp.person_id = p.id
        JOIN message_messages mm ON mm.thread_id = mp.thread_id
        WHERE mm.body IS NOT NULL AND mm.body != '' AND lower(p.display_name) != 'you'
        GROUP BY p.id
        ORDER BY messageCount DESC
        LIMIT 8
      `)
      .all()
      .map((row) => ({
        id: String((row as Record<string, unknown>).id),
        displayName: String((row as Record<string, unknown>).displayName),
        messageCount: Number((row as Record<string, unknown>).messageCount),
      }));
    const selectedDirtyDocuments = Number(coverage.selectedDirtyDocuments ?? 0);
    const effectiveRate = documentsPerSecond && documentsPerSecond > 0 ? documentsPerSecond : 40;

    return {
      priority,
      priorityConfigured: this.getSetting("embedding_priority") != null,
      earliestMessageAt: bounds.earliestMessageAt == null ? null : Number(bounds.earliestMessageAt),
      latestMessageAt: bounds.latestMessageAt == null ? null : Number(bounds.latestMessageAt),
      selectedMessages: Number(selected.selectedMessages ?? 0),
      selectedConversations: Number(selected.selectedConversations ?? 0),
      selectedDirtyDocuments,
      selectedEmbeddedDocuments: Number(coverage.selectedEmbeddedDocuments ?? 0),
      documentsPerSecond,
      estimatedSeconds: selectedDirtyDocuments > 0 ? Math.ceil(selectedDirtyDocuments / effectiveRate) : 0,
      estimateIsCalibrated: documentsPerSecond != null,
      timeline,
      people,
    };
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
        ORDER BY embedding_priority ASC, updated_at DESC
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

  private getSearchNavigation(kind: SearchResult["kind"], entityId: string): SearchNavigation {
    if (kind === "thread") {
      const row = this.db
        .prepare(`
          SELECT
            COALESCE(t.display_name, GROUP_CONCAT(DISTINCT COALESCE(p.display_name, mp.handle)), 'Message Thread') AS sourceLabel,
            t.last_message_at AS occurredAt
          FROM message_threads t
          LEFT JOIN message_participants mp ON mp.thread_id = t.id
          LEFT JOIN people p ON p.id = mp.person_id
          WHERE t.id = ?
          GROUP BY t.id
        `)
        .get(entityId) as { sourceLabel: string; occurredAt: number | null } | undefined;
      const sourceLabel = row?.sourceLabel ?? "Message Thread";
      return {
        threadId: entityId,
        messageId: null,
        personId: null,
        personLabel: null,
        senderLabel: null,
        direction: null,
        sourceLabel,
        primaryLabel: sourceLabel,
        occurredAt: row?.occurredAt ?? null,
        snippet: null,
      };
    }
    if (kind === "message") {
      const row = this.db
        .prepare(`
          SELECT
            mm.thread_id AS threadId,
            mm.person_id AS personId,
            mm.occurred_at AS occurredAt,
            mm.body AS body,
            mm.is_from_me AS isFromMe,
            COALESCE(sender.display_name, sender.primary_handle) AS senderLabel,
            COALESCE(t.display_name, GROUP_CONCAT(DISTINCT COALESCE(participant.display_name, mp.handle)), 'Message Thread') AS sourceLabel
          FROM message_messages mm
          LEFT JOIN message_threads t ON t.id = mm.thread_id
          LEFT JOIN message_participants mp ON mp.thread_id = mm.thread_id
          LEFT JOIN people participant ON participant.id = mp.person_id
          LEFT JOIN people sender ON sender.id = mm.person_id
          WHERE mm.id = ?
          GROUP BY mm.id
        `)
        .get(entityId) as {
          threadId: string;
          personId: string | null;
          occurredAt: number;
          body: string | null;
          isFromMe: number;
          senderLabel: string | null;
          sourceLabel: string | null;
        } | undefined;
      const direction = row ? (row.isFromMe ? "outgoing" : "incoming") : null;
      const senderLabel = direction === "outgoing" ? "You" : row?.senderLabel ?? "Unknown contact";
      return {
        threadId: row?.threadId ?? null,
        messageId: entityId,
        personId: row?.personId ?? null,
        personLabel: senderLabel,
        senderLabel,
        direction,
        sourceLabel: row?.sourceLabel ?? "Message",
        primaryLabel: senderLabel,
        occurredAt: row?.occurredAt ?? null,
        snippet: row?.body ?? null,
      };
    }
    if (kind === "person") {
      const row = this.db
        .prepare("SELECT display_name AS sourceLabel, updated_at AS occurredAt FROM people WHERE id = ?")
        .get(entityId) as { sourceLabel: string; occurredAt: number } | undefined;
      const sourceLabel = row?.sourceLabel ?? "Person";
      return {
        threadId: null,
        messageId: null,
        personId: entityId,
        personLabel: sourceLabel,
        senderLabel: null,
        direction: null,
        sourceLabel,
        primaryLabel: sourceLabel,
        occurredAt: null,
        snippet: null,
      };
    }
    return {
      threadId: null,
      messageId: null,
      personId: null,
      personLabel: null,
      senderLabel: null,
      direction: null,
      sourceLabel: null,
      primaryLabel: "Local record",
      occurredAt: null,
      snippet: null,
    };
  }

  private buildSearchDocumentFilter(input: SearchQueryInput) {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    const resultTypes = input.resultTypes?.length ? input.resultTypes : PRIMARY_SEARCH_RESULT_TYPES;
    const kinds = resultTypes.map((type) => type === "conversation" ? "thread" : type);
    clauses.push(`d.kind IN (${kinds.map(() => "?").join(", ")})`);
    params.push(...kinds);

    if (input.threadId) {
      clauses.push(`(
        (d.kind = 'thread' AND d.entity_id = ?)
        OR (d.kind = 'message' AND EXISTS (
          SELECT 1 FROM message_messages scoped_message
          WHERE scoped_message.id = d.entity_id AND scoped_message.thread_id = ?
        ))
        OR (d.kind = 'person' AND EXISTS (
          SELECT 1 FROM message_participants scoped_person
          WHERE scoped_person.thread_id = ? AND scoped_person.person_id = d.entity_id
        ))
      )`);
      params.push(input.threadId, input.threadId, input.threadId);
    }

    const personIds = [...new Set((input.personIds ?? []).filter(Boolean))];
    if (personIds.length > 0) {
      const placeholders = personIds.map(() => "?").join(", ");
      clauses.push(`(
        (d.kind = 'person' AND d.entity_id IN (${placeholders}))
        OR (d.kind IN ('thread', 'message') AND EXISTS (
          SELECT 1 FROM message_participants scoped_participant
          WHERE scoped_participant.person_id IN (${placeholders})
            AND scoped_participant.thread_id = CASE
              WHEN d.kind = 'thread' THEN d.entity_id
              ELSE (SELECT scoped_message.thread_id FROM message_messages scoped_message WHERE scoped_message.id = d.entity_id)
            END
        ))
      )`);
      params.push(...personIds, ...personIds);
    }

    if (input.dateRange?.startAt != null || input.dateRange?.endAt != null) {
      const dateClauses: string[] = [];
      const dateParams: number[] = [];
      if (input.dateRange.startAt != null) {
        dateClauses.push("dated_message.occurred_at >= ?");
        dateParams.push(input.dateRange.startAt);
      }
      if (input.dateRange.endAt != null) {
        dateClauses.push("dated_message.occurred_at < ?");
        dateParams.push(input.dateRange.endAt);
      }
      clauses.push(`EXISTS (
        SELECT 1 FROM message_messages dated_message
        WHERE ${dateClauses.join(" AND ")}
          AND (
            (d.kind = 'message' AND dated_message.id = d.entity_id)
            OR (d.kind = 'thread' AND dated_message.thread_id = d.entity_id)
            OR (d.kind = 'person' AND (
              dated_message.person_id = d.entity_id
              OR EXISTS (
                SELECT 1 FROM message_participants dated_participant
                WHERE dated_participant.thread_id = dated_message.thread_id
                  AND dated_participant.person_id = d.entity_id
              )
            ))
          )
      )`);
      params.push(...dateParams);
    }

    return { sql: clauses.join(" AND "), params, kinds };
  }

  searchRecords(input: SearchQueryInput, queryEmbedding?: number[]) {
    const query = input.text.trim();
    const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 20)));
    if (!query) return [];
    const candidateLimit = Math.min(1_000, Math.max(40, limit * 4));
    const semanticCandidateLimit = Math.min(2_000, Math.max(800, candidateLimit * 10));
    const documentFilter = this.buildSearchDocumentFilter(input);
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
              bm25(search_documents_fts) AS textScore
            FROM search_documents_fts
            CROSS JOIN search_documents d ON d.rowid = search_documents_fts.rowid
            WHERE search_documents_fts MATCH ? AND ${documentFilter.sql}
            ORDER BY textScore, d.id ASC
            LIMIT ?
          `)
          .all(safeQuery, ...documentFilter.params, candidateLimit) as Array<Record<string, unknown>>)
      : [];

    const escapedQuery = query.replace(/[%_]/g, (char) => `\\${char}`);
    const fallbackRows = textRows.length === 0
      ? (this.db
          .prepare(`
            SELECT id, kind, entity_id AS entityId, title, content, 0 AS textScore
            FROM search_documents d
            WHERE (d.title LIKE ? ESCAPE '\\' OR d.content LIKE ? ESCAPE '\\')
              AND ${documentFilter.sql}
            ORDER BY d.id ASC
            LIMIT ?
          `)
          .all(`%${escapedQuery}%`, `%${escapedQuery}%`, ...documentFilter.params, candidateLimit) as Array<Record<string, unknown>>)
      : textRows;

    let semanticRows: Array<Record<string, unknown>> = [];
    if (queryEmbedding) {
      const queryVector = new Uint8Array(Float32Array.from(queryEmbedding).buffer);
      const hasRelationalScope = Boolean(
        input.threadId
        || input.personIds?.length
        || input.dateRange?.startAt != null
        || input.dateRange?.endAt != null,
      );
      if (hasRelationalScope) {
        // Relationship/date constraints cannot be represented inside vec0.
        // Filter first so a relevant scoped result cannot be discarded by a
        // global approximate candidate cutoff, then rank the bounded scope.
        semanticRows = this.db
          .prepare(`
            SELECT
              d.id,
              d.kind,
              d.entity_id AS entityId,
              d.title,
              d.content,
              NULL AS textScore,
              MAX(0, 1.0 - vec_distance_cosine(d.embedding, ?)) AS semanticScore
            FROM search_documents d
            WHERE d.embedding IS NOT NULL
              AND length(d.embedding) > 0
              AND ${documentFilter.sql}
            ORDER BY semanticScore DESC
            LIMIT ?
          `)
          .all(queryVector, ...documentFilter.params, candidateLimit) as Array<Record<string, unknown>>;
      } else {
        const kindFilter = documentFilter.kinds.map(() => "kind = ?").join(" OR ");
        semanticRows = this.db
          .prepare(`
            WITH semantic_matches AS MATERIALIZED (
              SELECT rowid
              FROM search_document_binary_vectors
              WHERE embedding MATCH vec_quantize_binary(?)
                AND k = ?
                AND (${kindFilter})
            )
            SELECT
              d.id,
              d.kind,
              d.entity_id AS entityId,
              d.title,
              d.content,
              NULL AS textScore,
              MAX(0, 1.0 - vec_distance_cosine(d.embedding, ?)) AS semanticScore
            FROM semantic_matches
            CROSS JOIN search_documents d ON d.rowid = semantic_matches.rowid
            WHERE ${documentFilter.sql}
            ORDER BY semanticScore DESC
            LIMIT ?
          `)
          .all(
            queryVector,
            semanticCandidateLimit,
            ...documentFilter.kinds,
            queryVector,
            ...documentFilter.params,
            candidateLimit,
          ) as Array<Record<string, unknown>>;
      }
    }

    const byId = new Map<string, Record<string, unknown> & { exactMatch?: boolean }>();
    for (const row of fallbackRows) {
      byId.set(String(row.id), { ...row, exactMatch: true });
    }
    for (const row of semanticRows) {
      const id = String(row.id);
      const existing = byId.get(id);
      if (existing) {
        existing.semanticScore = row.semanticScore;
      } else {
        byId.set(id, { ...row, exactMatch: false });
      }
    }

    const scored = [...byId.values()].flatMap((row) => {
      const rawSemanticScore = Number(row.semanticScore ?? 0);
      const semanticScore = Number.isFinite(rawSemanticScore) ? rawSemanticScore : 0;
      const keywordScore = Number(row.textScore ?? 0);
      const textScore = Number.isFinite(keywordScore) ? Math.max(0, -keywordScore) : 0;
      const exact = row.exactMatch === true;
      const semantic = Boolean(queryEmbedding && row.semanticScore != null);
      if (!exact && semanticScore <= 0) return [];
      const combinedScore = (exact ? 2 : 0) + textScore + Math.max(0, semanticScore);

      return [{ row, exact, semantic, semanticScore, textScore, combinedScore }];
    });

    // Score the local vectors first, then hydrate only the strongest candidates.
    // Hydrating every embedded document performs one or more SQLite lookups per
    // row and can block Electron's main process for minutes on a large archive.
    const hydrationCandidates = scored
      .sort((left, right) => {
        if (left.exact !== right.exact) return left.exact ? -1 : 1;
        if (right.combinedScore !== left.combinedScore) return right.combinedScore - left.combinedScore;
        return String(left.row.id).localeCompare(String(right.row.id));
      })
      .slice(0, candidateLimit);

    const ranked = hydrationCandidates.flatMap(({ row, exact, semantic, semanticScore, textScore, combinedScore }) => {
      const kind = String(row.kind) as SearchResult["kind"];
      const entityId = String(row.entityId);
      const navigation = this.getSearchNavigation(kind, entityId);
      const resultType = resultTypeForKind(kind);
      if (!resultType) return [];
      const title = String(row.title);
      const titleHasLiteralQuery = title.toLocaleLowerCase().includes(query.toLocaleLowerCase());
      const matchReason = exact
        ? kind === "person"
          ? "person"
          : kind === "thread" && titleHasLiteralQuery
            ? "conversation_title"
            : "exact_words"
        : "related_wording";
      if (!navigation.sourceLabel) return [];

      const result = {
        id: String(row.id),
        kind,
        resultType,
        entityId,
        sourceEntityId: entityId,
        title,
        primaryLabel: navigation.primaryLabel,
        snippet: String(navigation.snippet ?? row.content).slice(0, 360),
        score: combinedScore,
        scoreComponents: { exact, semantic, textScore, semanticScore },
        matchReason,
        direction: navigation.direction,
        senderLabel: navigation.senderLabel,
        citation: {
          sourceEntityId: entityId,
          personId: navigation.personId,
          personLabel: navigation.personLabel,
          threadId: navigation.threadId,
          conversationLabel: navigation.sourceLabel,
          messageId: navigation.messageId,
          occurredAt: navigation.occurredAt,
        },
        navigationTarget: resultType === "person"
          ? { view: "people" as const, personId: entityId }
          : { view: "conversations" as const, threadId: navigation.threadId!, messageId: navigation.messageId },
        threadId: navigation.threadId,
        messageId: navigation.messageId,
        personId: navigation.personId,
        sourceLabel: navigation.sourceLabel,
        occurredAt: navigation.occurredAt,
      } satisfies SearchResult;
      return [result];
    });

    return ranked
      .sort((left, right) => {
        if (left.scoreComponents.exact !== right.scoreComponents.exact) return left.scoreComponents.exact ? -1 : 1;
        if (right.score !== left.score) return right.score - left.score;
        if ((right.occurredAt ?? 0) !== (left.occurredAt ?? 0)) return (right.occurredAt ?? 0) - (left.occurredAt ?? 0);
        return left.id.localeCompare(right.id);
      })
      .slice(0, limit);
  }

  search(query: string, limit = 10, queryEmbedding?: number[], scope?: SearchScope) {
    const input: SearchQueryInput = {
      text: query,
      limit,
      resultTypes: scope?.sourceScope === "thread" ? ["message", "conversation"] : PRIMARY_SEARCH_RESULT_TYPES,
      personIds: scope?.sourceScope === "person" && scope.personId ? [scope.personId] : undefined,
      threadId: scope?.sourceScope === "thread" ? scope.threadId : undefined,
    };
    return this.searchRecords(input, queryEmbedding);
  }

  getEmbeddingSyncStatus() {
    const row = this.db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM search_documents) AS totalDocuments,
          (SELECT COUNT(*) FROM search_document_vector_rows) AS embeddedDocuments,
          (SELECT COUNT(*) FROM search_document_binary_vector_rows) AS semanticIndexedDocuments,
          (SELECT COUNT(*) FROM search_documents WHERE dirty = 1) AS dirtyDocuments,
          (SELECT embedding_provider FROM search_documents
            WHERE dirty = 0 AND embedding_provider IS NOT NULL LIMIT 1) AS provider,
          (SELECT embedding_model FROM search_documents
            WHERE dirty = 0 AND embedding_model IS NOT NULL LIMIT 1) AS model
      `)
      .get() as Record<string, unknown>;

    return {
      totalDocuments: Number(row.totalDocuments ?? 0),
      embeddedDocuments: Number(row.embeddedDocuments ?? 0),
      semanticIndexedDocuments: Number(row.semanticIndexedDocuments ?? 0),
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
          (SELECT COUNT(*) FROM search_documents) AS totalDocuments,
          (SELECT COUNT(*) FROM search_document_vector_rows) AS embeddedDocuments,
          (SELECT COUNT(*) FROM search_documents WHERE dirty = 1) AS dirtyDocuments
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

  getConversationCitationContext(
    threadId: string,
    messageId: string,
    before = 3,
    after = 3,
  ): ConversationCitationContext | null {
    const thread = this.getThreadDetail(threadId);
    if (!thread) return null;

    const anchor = this.db.prepare(`
      SELECT
        mm.id, mm.thread_id AS threadId, mm.person_id AS personId,
        mm.body, mm.occurred_at AS occurredAt, mm.is_from_me AS isFromMe,
        mm.has_attachments AS hasAttachments
      FROM message_messages mm
      WHERE mm.thread_id = ? AND mm.id = ?
    `).get(threadId, messageId) as Record<string, unknown> | undefined;
    if (!anchor) return null;

    const beforeLimit = Math.max(0, Math.min(25, Math.floor(before)));
    const afterLimit = Math.max(0, Math.min(25, Math.floor(after)));
    const occurredAt = Number(anchor.occurredAt);
    const olderRows = this.db.prepare(`
      SELECT
        mm.id, mm.thread_id AS threadId, mm.person_id AS personId,
        mm.body, mm.occurred_at AS occurredAt, mm.is_from_me AS isFromMe,
        mm.has_attachments AS hasAttachments
      FROM message_messages mm
      WHERE mm.thread_id = ?
        AND (mm.occurred_at < ? OR (mm.occurred_at = ? AND mm.id < ?))
      ORDER BY mm.occurred_at DESC, mm.id DESC
      LIMIT ?
    `).all(threadId, occurredAt, occurredAt, messageId, beforeLimit + 1) as Array<Record<string, unknown>>;
    const newerRows = this.db.prepare(`
      SELECT
        mm.id, mm.thread_id AS threadId, mm.person_id AS personId,
        mm.body, mm.occurred_at AS occurredAt, mm.is_from_me AS isFromMe,
        mm.has_attachments AS hasAttachments
      FROM message_messages mm
      WHERE mm.thread_id = ?
        AND (mm.occurred_at > ? OR (mm.occurred_at = ? AND mm.id > ?))
      ORDER BY mm.occurred_at ASC, mm.id ASC
      LIMIT ?
    `).all(threadId, occurredAt, occurredAt, messageId, afterLimit + 1) as Array<Record<string, unknown>>;

    const hasOlder = olderRows.length > beforeLimit;
    const hasNewer = newerRows.length > afterLimit;
    const contextRows = [
      ...olderRows.slice(0, beforeLimit).reverse(),
      anchor,
      ...newerRows.slice(0, afterLimit),
    ];

    return {
      thread,
      citedMessageId: messageId,
      messages: this.mapMessageRows(contextRows),
      citedMessageIndex: Math.min(beforeLimit, olderRows.length),
      hasOlder,
      hasNewer,
    };
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
