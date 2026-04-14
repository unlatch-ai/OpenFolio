import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
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

describe("OpenFolioCore", () => {
  let dbPath: string;
  let chatDbPath: string;

  beforeEach(() => {
    dbPath = tempPath("openfolio.sqlite");
    chatDbPath = tempPath("chat.db");
    seedMessagesDb(chatDbPath);
    process.env.OPENFOLIO_MESSAGES_DB_PATH = chatDbPath;
    delete process.env.OPENAI_API_KEY;
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
