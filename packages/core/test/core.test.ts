import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchDocumentRecord } from "@openfolio/shared-types";
import { findDuplicatePeople, OpenFolioCore } from "../src/index.js";

function tempPath(name: string) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openfolio-")), name);
}

function testEmbedding(axis = 0) {
  return Array.from({ length: 384 }, (_, index) => index === axis ? 1 : 0);
}

function seedMessagesDb(chatDbPath: string) {
  const db = new DatabaseSync(chatDbPath);
  db.exec(`
    CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, handle_id INTEGER, is_from_me INTEGER, date INTEGER, service TEXT);
    CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
    CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, chat_identifier TEXT, service_name TEXT);
    CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
    CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY, filename TEXT, mime_type TEXT, transfer_name TEXT);
    CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER);
  `);

  db.prepare("INSERT INTO handle(ROWID, id) VALUES (1, '+15555550123')").run();
  db.prepare("INSERT INTO chat(ROWID, chat_identifier, service_name) VALUES (1, 'Ada', 'iMessage')").run();
  db.prepare("INSERT INTO message(ROWID, text, handle_id, is_from_me, date, service) VALUES (1, 'hello ada', 1, 0, 1000, 'iMessage')").run();
  db.prepare("INSERT INTO chat_message_join(chat_id, message_id) VALUES (1, 1)").run();
  db.close();
}

function appendMessage(chatDbPath: string) {
  const db = new DatabaseSync(chatDbPath);
  db.prepare("INSERT INTO message(ROWID, text, handle_id, is_from_me, date, service) VALUES (2, 'checking in again', 1, 0, 2000, 'iMessage')").run();
  db.prepare("INSERT INTO chat_message_join(chat_id, message_id) VALUES (1, 2)").run();
  db.close();
}

function appendManyMessages(chatDbPath: string, count: number) {
  const db = new DatabaseSync(chatDbPath);
  const insertMessage = db.prepare("INSERT INTO message(ROWID, text, handle_id, is_from_me, date, service) VALUES (?, ?, 1, 0, ?, 'iMessage')");
  const insertJoin = db.prepare("INSERT INTO chat_message_join(chat_id, message_id) VALUES (1, ?)");
  for (let index = 2; index < count + 2; index += 1) {
    insertMessage.run(index, `bulk message ${index}`, index * 1000);
    insertJoin.run(index);
  }
  db.close();
}

function appendManyMatchingMessages(chatDbPath: string, count: number, text: string) {
  const db = new DatabaseSync(chatDbPath);
  const insertMessage = db.prepare("INSERT INTO message(ROWID, text, handle_id, is_from_me, date, service) VALUES (?, ?, 1, 0, ?, 'iMessage')");
  const insertJoin = db.prepare("INSERT INTO chat_message_join(chat_id, message_id) VALUES (1, ?)");
  for (let index = 2; index < count + 2; index += 1) {
    insertMessage.run(index, `${text} ${index}`, index * 1000);
    insertJoin.run(index);
  }
  db.close();
}

function appendAttachmentMessage(chatDbPath: string) {
  const db = new DatabaseSync(chatDbPath);
  db.prepare("INSERT INTO message(ROWID, text, handle_id, is_from_me, date, service) VALUES (200, NULL, 1, 0, 200000, 'iMessage')").run();
  db.prepare("INSERT INTO chat_message_join(chat_id, message_id) VALUES (1, 200)").run();
  db.prepare("INSERT INTO attachment(ROWID, filename, mime_type, transfer_name) VALUES (1, '/tmp/report.pdf', 'application/pdf', 'report.pdf')").run();
  db.prepare("INSERT INTO message_attachment_join(message_id, attachment_id) VALUES (200, 1)").run();
  db.close();
}

function appendSecondPersonThread(chatDbPath: string) {
  const db = new DatabaseSync(chatDbPath);
  db.prepare("INSERT INTO handle(ROWID, id) VALUES (2, '+15555550124')").run();
  db.prepare("INSERT INTO chat(ROWID, chat_identifier, service_name) VALUES (2, 'Bob', 'iMessage')").run();
  db.prepare("INSERT INTO message(ROWID, text, handle_id, is_from_me, date, service) VALUES (300, 'bob private planning', 2, 0, 300000, 'iMessage')").run();
  db.prepare("INSERT INTO chat_message_join(chat_id, message_id) VALUES (2, 300)").run();
  db.close();
}

function seedLegacyLocalDb(localDbPath: string) {
  const db = new DatabaseSync(localDbPath);
  db.exec(`
    PRAGMA user_version = 2;
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE search_documents (
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
    INSERT INTO settings(key, value) VALUES ('legacy', 'stale');
    INSERT INTO search_documents(id, kind, entity_id, title, content, updated_at)
      VALUES ('doc_stale', 'person', 'person_missing', 'Stale', 'Dangling document', 1);
  `);
  db.close();
}

function seedFutureLocalDb(localDbPath: string) {
  const db = new DatabaseSync(localDbPath);
  db.exec(`
    PRAGMA user_version = 999;
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO settings(key, value) VALUES ('future', 'keep');
  `);
  db.close();
}

describe("OpenFolioCore", () => {
  let dbPath: string;
  let chatDbPath: string;

  beforeEach(() => {
    dbPath = tempPath("openfolio.sqlite");
    chatDbPath = tempPath("chat.db");
    seedMessagesDb(chatDbPath);
    process.env.OPENFOLIO_MESSAGES_DB_PATH = chatDbPath;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENFOLIO_IMPORT_BATCH_SIZE;
  });

  it("imports Messages rows, builds dirty documents, and keeps search working without embeddings", async () => {
    const core = new OpenFolioCore({ dbPath });
    const job = await core.startMessagesImport();

    expect(job.status).toBe("completed");
    expect(job.importedMessages).toBe(1);

    const dirtyDocs = core.db.getDirtySearchDocuments();
    expect(dirtyDocs.length).toBeGreaterThan(0);

    const results = await core.search("ada");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.snippet.includes("hello ada") || result.title.includes("Ada"))).toBe(true);
    const messageHit = results.find((result) => result.kind === "message");
    expect(messageHit?.threadId).toBeTruthy();
    expect(messageHit?.messageId).toBeTruthy();
  });

  it("persists a resumable embedding priority and reports its local estimate", async () => {
    appendManyMessages(chatDbPath, 8);
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();

    const initial = core.getEmbeddingPlanStats();
    expect(initial.priorityConfigured).toBe(false);
    expect(initial.selectedMessages).toBe(9);
    expect(initial.timeline.length).toBeGreaterThan(0);

    const narrowed = core.setEmbeddingPriority({
      startAt: initial.latestMessageAt,
      endAt: (initial.latestMessageAt ?? 0) + 1,
      personIds: [],
    });
    expect(narrowed.priorityConfigured).toBe(true);
    expect(narrowed.selectedMessages).toBe(1);
    expect(narrowed.selectedDirtyDocuments).toBe(1);
    expect(narrowed.estimatedSeconds).toBeGreaterThanOrEqual(1);

    const reopened = new OpenFolioCore({ dbPath }).getEmbeddingPlanStats();
    expect(reopened.priority).toEqual(narrowed.priority);
    expect(reopened.selectedMessages).toBe(1);
  });

  it("backs up and preserves durable local data during schema migration", () => {
    seedLegacyLocalDb(dbPath);
    const core = new OpenFolioCore({ dbPath });

    expect(core.db.getSetting("legacy")).toBe("stale");
    expect(core.db.query<{ count: number }>("SELECT COUNT(*) AS count FROM search_documents")[0]?.count).toBe(0);

    const backupDir = path.join(path.dirname(dbPath), "backups");
    expect(fs.readdirSync(backupDir).some((entry) => entry.includes("before-schema-2-to-3"))).toBe(true);
  });

  it("refuses to open a database from a newer schema without resetting it", () => {
    seedFutureLocalDb(dbPath);

    expect(() => new OpenFolioCore({ dbPath })).toThrow(/newer version/i);

    const db = new DatabaseSync(dbPath, { readOnly: true });
    expect((db.prepare("SELECT value FROM settings WHERE key = 'future'").get() as { value: string }).value).toBe("keep");
    db.close();
  });

  it("imports only the delta on the next Messages sync", async () => {
    const core = new OpenFolioCore({ dbPath });
    const firstJob = await core.startMessagesImport();
    appendMessage(chatDbPath);
    const secondJob = await core.startMessagesImport();

    expect(firstJob.importedMessages).toBe(1);
    expect(secondJob.importedMessages).toBe(1);
    expect(secondJob.lastCursor).toBe(2);
  });

  it("imports more than one Messages page in a single sync", async () => {
    process.env.OPENFOLIO_IMPORT_BATCH_SIZE = "2";
    appendManyMessages(chatDbPath, 4);
    const core = new OpenFolioCore({ dbPath });
    const job = await core.startMessagesImport();

    expect(job.status).toBe("completed");
    expect(job.importedMessages).toBe(5);
    expect(job.lastCursor).toBe(5);
    delete process.env.OPENFOLIO_IMPORT_BATCH_SIZE;
  });

  it("can cancel a running Messages import between batches and retry later", async () => {
    process.env.OPENFOLIO_IMPORT_BATCH_SIZE = "1";
    appendManyMessages(chatDbPath, 8);
    const core = new OpenFolioCore({ dbPath });
    const started = core.startMessagesImport();
    const job = core.messages.getActiveJob();
    expect(job?.status).toBe("running");
    expect(job).toBeTruthy();
    while (job!.importedMessages === 0) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }

    const cancelled = core.cancelMessagesImport(job!.id);
    const result = await started;

    expect(cancelled).toBeTruthy();
    expect(result.status).toBe("cancelled");
    expect(result.importedMessages).toBeGreaterThan(0);
    expect(result.importedMessages).toBeLessThan(9);

    const interruptedDb = new DatabaseSync(dbPath, { allowExtension: true });
    sqliteVec.load(interruptedDb);
    interruptedDb.exec("DELETE FROM search_documents");
    interruptedDb.close();
    const retry = await core.retryMessagesImport(result.id);
    expect(retry.status).toBe("completed");
    expect(retry.lastCursor).toBe(9);
    expect(
      core.db.query<{ count: number }>("SELECT COUNT(*) AS count FROM search_documents WHERE kind = 'message'")[0]?.count,
    ).toBe(9);
    delete process.env.OPENFOLIO_IMPORT_BATCH_SIZE;
  });

  it("finds semantic-only matches from embedded documents without keyword hits", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const dirtyDocs = core.db.getDirtySearchDocuments();
    for (const doc of dirtyDocs) {
      core.db.markSearchDocumentEmbedded(doc.id, doc.kind === "message" ? testEmbedding(0) : testEmbedding(1), "local", "test");
    }

    const results = core.db.search("unrelated words", 5, testEmbedding(0));

    expect(results[0]?.kind).toBe("message");
    expect(results[0]?.snippet).toContain("hello ada");
    expect(results[0]?.matchReason).toBe("related_wording");
    expect(results[0]?.scoreComponents).toMatchObject({ exact: false, semantic: true });
  });

  it("resumes a missing derived vector index without re-embedding documents", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const messageDocument = core.db.getDirtySearchDocuments().find((document) => document.kind === "message")!;
    core.db.markSearchDocumentEmbedded(messageDocument.id, testEmbedding(0), "local", "test");

    const rawDb = new DatabaseSync(dbPath, { allowExtension: true });
    sqliteVec.load(rawDb);
    rawDb.exec("DELETE FROM search_document_vectors");
    rawDb.close();

    expect(core.db.getSearchVectorIndexStatus()).toMatchObject({ embeddedDocuments: 1, indexedDocuments: 0 });
    expect(core.db.backfillSearchVectorIndex()).toBe(1);
    expect(core.db.getSearchVectorIndexStatus()).toMatchObject({ embeddedDocuments: 1, indexedDocuments: 1 });
    expect(core.db.search("unrelated words", 5, testEmbedding(0))[0]?.kind).toBe("message");
  });

  it("hydrates only a bounded set of semantic candidates", async () => {
    appendManyMessages(chatDbPath, 500);
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    for (const document of core.db.getDirtySearchDocuments(1_000)) {
      if (document.kind === "message") {
        core.db.markSearchDocumentEmbedded(document.id, testEmbedding(0), "local", "test");
      }
    }

    const navigationSpy = vi.spyOn(
      core.db as unknown as { getSearchNavigation: (...args: unknown[]) => unknown },
      "getSearchNavigation",
    );
    const results = core.db.search("unrelated words", 5, testEmbedding(0));

    expect(results).toHaveLength(5);
    expect(navigationSpy.mock.calls.length).toBeLessThanOrEqual(80);
  });

  it("only marks successfully embedded documents and reports skipped documents", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const dirtyDocs = core.db.getDirtySearchDocuments(2);
    expect(dirtyDocs.length).toBeGreaterThan(1);

    core.ai = {
      embedDocuments: async () => [testEmbedding(0), null],
      getEmbeddingMetadata: () => ({ provider: "local", model: "test" }),
    } as unknown as OpenFolioCore["ai"];

    const result = await core.syncDirtySearchDocuments(2);
    const status = core.getEmbeddingSyncStatus();

    expect(result).toEqual({ embedded: 1, skipped: 1 });
    expect(status.embeddedDocuments).toBe(1);
    expect(status.dirtyDocuments).toBeGreaterThanOrEqual(1);
  });

  it("tracks background embedding queue state while dirty documents drain", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    await core.queueEmbeddingSync();

    let releaseEmbedding!: () => void;
    const embeddingStarted = new Promise<void>((resolve) => {
      core.ai = {
        embedDocuments: async (documents: SearchDocumentRecord[]) => {
          resolve();
          await new Promise<void>((release) => {
            releaseEmbedding = release;
          });
          return documents.map(() => testEmbedding(0));
        },
        getEmbeddingMetadata: () => ({ provider: "local", model: "test" }),
      } as unknown as OpenFolioCore["ai"];
    });

    const queued = core.queueEmbeddingSync({ batchSize: 10, maxBatches: 10 });
    await embeddingStarted;
    expect(core.getEmbeddingSyncStatus().syncing).toBe(true);
    releaseEmbedding();
    await queued;

    const status = core.getEmbeddingSyncStatus();
    expect(status.syncing).toBe(false);
    expect(status.dirtyDocuments).toBe(0);
  });

  it("reports when embedded-document scale needs a local vector index benchmark", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();

    const status = core.getSearchScaleStatus({ vectorScanWarningThreshold: 1 });

    expect(status.embeddedDocuments).toBeGreaterThanOrEqual(0);
    expect(status.vectorScanWarningThreshold).toBe(1);
    expect(status.recommendVectorIndex).toBe(status.embeddedDocuments >= 1);
  });

  it("can fetch a thread message page around a selected search hit", async () => {
    appendManyMessages(chatDbPath, 150);
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();

    const [hit] = await core.search("bulk message 50");
    expect(hit?.kind).toBe("message");
    expect(hit?.threadId).toBeTruthy();
    expect(hit?.messageId).toBeTruthy();

    const newestPage = core.getThreadMessages(hit.threadId!, 20);
    expect(newestPage.some((message) => message.id === hit.messageId)).toBe(false);

    const aroundHit = core.getThreadMessages(hit.threadId!, 20, 0, hit.messageId);
    expect(aroundHit.some((message) => message.id === hit.messageId)).toBe(true);
  });

  it("fails gracefully when the Messages database is unavailable", async () => {
    process.env.OPENFOLIO_MESSAGES_DB_PATH = tempPath("missing-chat.db");
    const core = new OpenFolioCore({ dbPath });
    const job = await core.startMessagesImport();

    expect(job.status).toBe("failed");
    expect(job.error).toContain("Messages database was not found");
  });

  it("applies connector sync results directly into the local graph", () => {
    const core = new OpenFolioCore({ dbPath });
    const summary = core.applyConnectorSync({
      people: [
        {
          displayName: "Ada Lovelace",
          primaryHandle: "ada@example.com",
          email: "ada@example.com",
          sourceKind: "google_contacts",
          sourceId: "people/1",
        },
      ],
      interactions: [
        {
          title: "Reaching out",
          summary: "Ada sent an update.",
          occurredAt: Date.now(),
          kind: "email",
          sourceKind: "gmail",
          sourceId: "msg_1",
          participantHandles: ["ada@example.com"],
        },
      ],
      cursor: { historyId: "123" },
      hasMore: false,
    });

    expect(summary.peopleImported).toBe(1);
    expect(summary.interactionsImported).toBe(1);
    expect(core.db.listPeople()).toHaveLength(1);
  });

  it("matches Apple Contacts onto an existing Messages person by normalized phone handle", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();

    const summary = core.applyConnectorSync({
      people: [
        {
          displayName: "Ada Lovelace",
          primaryHandle: "ada@example.com",
          email: "ada@example.com",
          phone: "+1 (555) 555-0123",
          sourceKind: "apple_contacts",
          sourceId: "contact-ada",
          metadata: {
            handles: ["ada@example.com", "+1 (555) 555-0123"],
          },
        },
      ],
      interactions: [],
      cursor: null,
      hasMore: false,
    });

    const people = core.db.listPeople();

    expect(summary.peopleImported).toBe(1);
    expect(people).toHaveLength(1);
    expect(people[0]?.displayName).toBe("Ada Lovelace");
    expect(people[0]?.primaryHandle).toBe("+15555550123");
  });

  it("builds a person profile from messages, contacts, notes, and reminders", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const person = core.db.listPeople().find((item) => item.primaryHandle === "+15555550123");
    expect(person).toBeTruthy();

    core.applyConnectorSync({
      people: [{
        displayName: "Ada Lovelace",
        primaryHandle: "+1 (555) 555-0123",
        email: "ada@example.com",
        companyName: "Analytical Engines",
        jobTitle: "Mathematician",
        sourceKind: "apple_contacts",
        sourceId: "ada",
      }],
      interactions: [],
      cursor: null,
      hasMore: false,
    });
    const updated = core.db.listPeople()[0];
    core.addNote("person", updated.id, "Met at the math salon.");
    core.addReminder("Follow up with Ada", updated.id, null);

    const profile = core.getPersonProfile(updated.id);

    expect(profile?.person.email).toBe("ada@example.com");
    expect(profile?.person.companyName).toBe("Analytical Engines");
    expect(profile?.threads.length).toBeGreaterThan(0);
    expect(profile?.recentMessages.length).toBeGreaterThan(0);
    expect(profile?.notes[0]?.content).toContain("math salon");
    expect(profile?.reminders[0]?.title).toBe("Follow up with Ada");
  });

  it("updates person profile fields and refreshes person search documents", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const person = core.db.listPeople()[0]!;

    const profile = core.updatePersonProfile(person.id, {
      displayName: "Ada Research",
      companyName: "Difference Labs",
      location: "London",
    });
    const results = await core.search("Difference Labs London");

    expect(profile?.person.displayName).toBe("Ada Research");
    expect(profile?.person.companyName).toBe("Difference Labs");
    expect(results.some((result) => result.kind === "person" && result.personId === person.id)).toBe(true);
  });

  it("stores aliases and uses them for people search and profile display", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const person = core.db.listPeople()[0]!;

    const alias = core.addPersonAlias(person.id, "Countess of Lovelace", "name");
    const pickerResults = core.listPeople(10, "Countess");
    const searchResults = await core.search("Countess of Lovelace");
    const profile = core.getPersonProfile(person.id);

    expect(alias.value).toBe("Countess of Lovelace");
    expect(pickerResults[0]?.id).toBe(person.id);
    expect(profile?.aliases[0]?.value).toBe("Countess of Lovelace");
    expect(searchResults.some((result) => result.kind === "person" && result.personId === person.id)).toBe(true);
  });

  it("pins notes ahead of regular notes", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const person = core.db.listPeople()[0]!;
    const first = core.addNote("person", person.id, "Regular note");
    const second = core.addNote("person", person.id, "Pinned note");

    core.pinNote(first.id);
    const profile = core.getPersonProfile(person.id);

    expect(second.content).toBe("Pinned note");
    expect(profile?.notes[0]?.id).toBe(first.id);
    expect(profile?.notes[0]?.pinned).toBe(true);
  });

  it("marks reminders done and reopens them in profile counts", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const person = core.db.listPeople()[0]!;
    const reminder = core.addReminder("Follow up", person.id, null);

    expect(core.getPersonProfile(person.id)?.digest.reminderCount).toBe(1);
    core.updateReminderStatus(reminder.id, "done");
    expect(core.getPersonProfile(person.id)?.digest.reminderCount).toBe(0);
    core.updateReminderStatus(reminder.id, "open");
    expect(core.getPersonProfile(person.id)?.digest.reminderCount).toBe(1);
  });

  it("searches person messages beyond the recent profile window with pagination", async () => {
    appendManyMessages(chatDbPath, 40);
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const person = core.db.listPeople()[0]!;

    const firstPage = core.searchPersonMessages(person.id, "bulk message", 10, 0);
    const secondPage = core.searchPersonMessages(person.id, "bulk message", 10, 10);

    expect(firstPage).toHaveLength(10);
    expect(secondPage).toHaveLength(10);
    expect(new Set(firstPage.map((message) => message.id)).size).toBe(10);
    expect(secondPage.some((message) => firstPage.some((first) => first.id === message.id))).toBe(false);
  });

  it("returns stable thread pages and attachment metadata", async () => {
    appendManyMessages(chatDbPath, 25);
    appendAttachmentMessage(chatDbPath);
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const threadId = core.db.listThreadsPaginated(1)[0]!.threadId;

    const newest = core.getThreadMessages(threadId, 10, 0);
    const older = core.getThreadMessages(threadId, 10, 10);
    const attachmentMessage = core.getThreadMessages(threadId, 50).find((message) => message.hasAttachments);

    expect(newest.some((message) => older.some((olderMessage) => olderMessage.id === message.id))).toBe(false);
    expect(attachmentMessage?.attachments[0]).toMatchObject({
      transferName: "report.pdf",
      mimeType: "application/pdf",
      path: "/tmp/report.pdf",
    });
  });

  it("limits local retrieval to person and thread source filters", async () => {
    appendSecondPersonThread(chatDbPath);
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const people = core.db.listPeople();
    const ada = people.find((item) => item.primaryHandle === "+15555550123")!;
    const bob = people.find((item) => item.primaryHandle === "+15555550124")!;
    const bobThread = core.getPersonProfile(bob.id)?.threads[0]!;

    const personResults = await core.search("planning hello", 8, { sourceScope: "person", personId: ada.id });
    const threadResults = await core.search("planning hello", 8, { sourceScope: "thread", threadId: bobThread.threadId });

    expect(personResults.length).toBeGreaterThan(0);
    expect(personResults.every((result) => result.personId === ada.id || result.threadId !== bobThread.threadId)).toBe(true);
    expect(threadResults.length).toBeGreaterThan(0);
    expect(threadResults.every((result) => result.threadId === bobThread.threadId)).toBe(true);
  });

  it("returns typed exact results with stable citation and local navigation identity", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();

    const response = await core.searchArchive({ text: "hello ada", resultTypes: ["message"] });
    const hit = response.results[0];

    expect(response).toMatchObject({ state: "results", retrievalMode: "exact", semanticStatus: "unavailable" });
    expect(hit).toMatchObject({
      resultType: "message",
      matchReason: "exact_words",
      direction: "incoming",
      senderLabel: "+15555550123",
      scoreComponents: { exact: true },
    });
    expect(hit?.sourceEntityId).toBe(hit?.messageId);
    expect(hit?.citation).toMatchObject({
      sourceEntityId: hit?.messageId,
      threadId: hit?.threadId,
      messageId: hit?.messageId,
      occurredAt: hit?.occurredAt,
    });
    expect(hit?.navigationTarget).toEqual({ view: "conversations", threadId: hit?.threadId, messageId: hit?.messageId });
  });

  it("applies type, person, conversation, and date filters before ranking and limiting", async () => {
    appendManyMatchingMessages(chatDbPath, 120, "shared planning");
    appendSecondPersonThread(chatDbPath);
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const bob = core.db.listPeople().find((person) => person.primaryHandle === "+15555550124")!;
    const bobThreadId = core.getPersonProfile(bob.id)!.threads[0]!.threadId;
    const unfiltered = await core.searchArchive({ text: "planning", resultTypes: ["message"], limit: 5 });
    const repeated = await core.searchArchive({ text: "planning", resultTypes: ["message"], limit: 5 });
    const scoped = await core.searchArchive({
      text: "planning",
      resultTypes: ["message"],
      personIds: [bob.id],
      threadId: bobThreadId,
      limit: 1,
    });
    const bobOccurredAt = scoped.results[0]!.occurredAt!;
    const dated = await core.searchArchive({
      text: "planning",
      resultTypes: ["message"],
      dateRange: { startAt: bobOccurredAt, endAt: bobOccurredAt + 1 },
      limit: 10,
    });
    const peopleOnly = await core.searchArchive({ text: "Bob", resultTypes: ["person"] });
    const conversationsOnly = await core.searchArchive({ text: "Bob", resultTypes: ["conversation"] });

    expect(unfiltered.results).toHaveLength(5);
    expect(repeated.results.map((result) => result.id)).toEqual(unfiltered.results.map((result) => result.id));
    expect(scoped.results).toHaveLength(1);
    expect(scoped.results[0]).toMatchObject({ threadId: bobThreadId, personId: bob.id });
    expect(dated.results).toHaveLength(1);
    expect(dated.results.every((result) => result.occurredAt === bobOccurredAt)).toBe(true);
    expect(peopleOnly.results.length).toBeGreaterThan(0);
    expect(peopleOnly.results.every((result) => result.resultType === "person")).toBe(true);
    expect(conversationsOnly.results.length).toBeGreaterThan(0);
    expect(conversationsOnly.results.every((result) => result.resultType === "conversation")).toBe(true);
  });

  it("returns chronological evidence around a validated cited message", async () => {
    appendManyMessages(chatDbPath, 12);
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const response = await core.searchArchive({ text: "bulk message 7", resultTypes: ["message"] });
    const hit = response.results.find((result) => result.snippet.includes("bulk message 7"))!;

    const context = core.getConversationCitationContext(hit.threadId!, hit.messageId!, 2, 2);

    expect(context.messages).toHaveLength(5);
    expect(context.citedMessageIndex).toBe(2);
    expect(context.messages[context.citedMessageIndex]?.id).toBe(hit.messageId);
    expect(context.messages.map((message) => message.occurredAt)).toEqual(
      [...context.messages].map((message) => message.occurredAt).sort((left, right) => left - right),
    );
    expect(() => core.getConversationCitationContext(hit.threadId!, "message_missing")).toThrow(/not available/i);
  });

  it("returns a typed error state for invalid search filters", async () => {
    const core = new OpenFolioCore({ dbPath });
    const response = await core.searchArchive({ text: "hello", dateRange: { startAt: 2, endAt: 1 } });

    expect(response).toMatchObject({
      state: "error",
      results: [],
      error: { code: "invalid_filters" },
    });
  });

  it("reports partial semantic indexing while exact results remain available", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    core.ai = { embed: async () => testEmbedding(0) } as unknown as OpenFolioCore["ai"];

    const response = await core.searchArchive({ text: "hello", resultTypes: ["message"] });

    expect(response).toMatchObject({
      state: "results",
      retrievalMode: "exact",
      semanticStatus: "indexing",
      error: null,
    });
  });

  it("does not inflate top contacts with me or unrelated group participants", async () => {
    const db = new DatabaseSync(chatDbPath);
    db.prepare("INSERT INTO handle(ROWID, id) VALUES (2, '+15555550124')").run();
    db.prepare("INSERT INTO chat(ROWID, chat_identifier, service_name) VALUES (2, 'Group', 'iMessage')").run();
    db.prepare("INSERT INTO message(ROWID, text, handle_id, is_from_me, date, service) VALUES (2, 'ada in the group', 1, 0, 2000, 'iMessage')").run();
    db.prepare("INSERT INTO message(ROWID, text, handle_id, is_from_me, date, service) VALUES (3, 'hello from bob', 2, 0, 3000, 'iMessage')").run();
    db.prepare("INSERT INTO message(ROWID, text, handle_id, is_from_me, date, service) VALUES (4, 'my group reply', NULL, 1, 4000, 'iMessage')").run();
    db.prepare("INSERT INTO chat_message_join(chat_id, message_id) VALUES (2, 2)").run();
    db.prepare("INSERT INTO chat_message_join(chat_id, message_id) VALUES (2, 3)").run();
    db.prepare("INSERT INTO chat_message_join(chat_id, message_id) VALUES (2, 4)").run();
    db.close();

    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const ada = core.db.listPeople().find((item) => item.primaryHandle === "+15555550123");
    const bob = core.db.listPeople().find((item) => item.primaryHandle === "+15555550124");

    expect(core.analytics.getRelationshipStats(ada!.id)?.totalMessages).toBe(2);
    expect(core.analytics.getRelationshipStats(bob!.id)?.totalMessages).toBe(1);
    expect(core.analytics.getTopContacts(5).some((contact) => contact.displayName === "You")).toBe(false);
  });

  it("finds duplicate local people by handle or name", () => {
    const core = new OpenFolioCore({ dbPath });
    const first = core.db.getOrCreatePerson("ada@example.com", "Ada Lovelace");
    const second = core.db.getOrCreatePerson("charles@example.com", "Ada Lovelace");
    const third = core.db.getOrCreatePerson("ada@example.com", "Ada L.");

    const duplicates = findDuplicatePeople([first, second, third]);
    expect(duplicates.length).toBeGreaterThan(0);
    expect(duplicates[0]?.reason).toContain("Same handle");
  });
});
