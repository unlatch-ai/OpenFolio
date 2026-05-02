import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { SearchDocumentRecord } from "@openfolio/shared-types";
import { findDuplicatePeople, OpenFolioCore } from "../src/index.js";

function tempPath(name: string) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openfolio-")), name);
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

  it("finds semantic-only matches from embedded documents without keyword hits", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const dirtyDocs = core.db.getDirtySearchDocuments();
    for (const doc of dirtyDocs) {
      core.db.markSearchDocumentEmbedded(doc.id, doc.kind === "message" ? [1, 0, 0] : [0, 1, 0], "local", "test");
    }

    const results = core.db.search("unrelated words", 5, [1, 0, 0]);

    expect(results[0]?.kind).toBe("message");
    expect(results[0]?.snippet).toContain("hello ada");
  });

  it("only marks successfully embedded documents and reports skipped documents", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const dirtyDocs = core.db.getDirtySearchDocuments(2);
    expect(dirtyDocs.length).toBeGreaterThan(1);

    core.ai = {
      embedDocuments: async () => [[1, 0, 0], null],
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
          return documents.map(() => [1, 0, 0]);
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
