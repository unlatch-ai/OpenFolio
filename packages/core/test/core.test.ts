import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { OpenFolioCore } from "../src/app.js";

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

describe("OpenFolioCore", () => {
  let dbPath: string;
  let chatDbPath: string;

  beforeEach(() => {
    dbPath = tempPath("openfolio.sqlite");
    chatDbPath = tempPath("chat.db");
    seedMessagesDb(chatDbPath);
    process.env.OPENFOLIO_MESSAGES_DB_PATH = chatDbPath;
  });

  it("imports Messages rows and makes them searchable", async () => {
    const core = new OpenFolioCore({ dbPath });
    const job = await core.startMessagesImport();

    expect(job.status).toBe("completed");
    expect(job.importedMessages).toBe(1);

    const results = await core.search("ada");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.snippet.includes("hello ada") || result.title.includes("Ada"))).toBe(true);
  });

  it("creates notes and reminders locally", async () => {
    const core = new OpenFolioCore({ dbPath });
    await core.startMessagesImport();
    const person = core.db.rawQuery("SELECT id FROM people LIMIT 1")[0] as { id: string };

    const note = core.addNote("person", person.id, "Ada is a longtime collaborator.");
    const reminder = core.addReminder("Follow up with Ada", person.id, Date.now());

    expect(note.content).toContain("Ada");
    expect(reminder.title).toContain("Follow up");
  });
});
