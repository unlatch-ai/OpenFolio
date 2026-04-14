import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { MessagesAccessStatus, MessagesImportJob } from "@openfolio/shared-types";
import { OpenFolioDatabase } from "./db.js";
import { appleTimestampToUnixMs, createId, normalizeHandle, now } from "./utils.js";

type RawMessageRow = {
  sourceMessageId: number;
  chatId: number | null;
  chatIdentifier: string | null;
  body: string | null;
  service: string | null;
  handleValue: string | null;
  isFromMe: number;
  appleDate: string | null;
  attachmentPath: string | null;
  attachmentMimeType: string | null;
  attachmentTransferName: string | null;
};

export const DEFAULT_MESSAGES_DB_PATH = path.join(os.homedir(), "Library", "Messages", "chat.db");

export function getMessagesAccessStatus(chatDbPath = process.env.OPENFOLIO_MESSAGES_DB_PATH || DEFAULT_MESSAGES_DB_PATH): MessagesAccessStatus {
  if (!fs.existsSync(chatDbPath)) {
    return {
      status: "missing",
      chatDbPath,
      details: "Messages database was not found. Make sure Messages has been used on this Mac."
    };
  }

  try {
    fs.accessSync(chatDbPath, fs.constants.R_OK);
    const db = new DatabaseSync(chatDbPath, { open: true, readOnly: true });
    db.prepare("select count(*) as count from sqlite_master").get();
    db.close();
    return {
      status: "granted",
      chatDbPath,
      details: "Messages database is readable."
    };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "Messages database exists but is not readable.";
    return {
      status: "denied",
      chatDbPath,
      details: `OpenFolio cannot read Messages yet. ${message}`
    };
  }
}

export class MessagesImporter {
  private readonly jobs = new Map<string, MessagesImportJob>();

  constructor(private readonly database: OpenFolioDatabase) {}

  getJob(jobId: string) {
    return this.jobs.get(jobId) ?? null;
  }

  async importFromChatDb(chatDbPath = process.env.OPENFOLIO_MESSAGES_DB_PATH || DEFAULT_MESSAGES_DB_PATH) {
    const access = getMessagesAccessStatus(chatDbPath);
    const job: MessagesImportJob = {
      id: createId("import"),
      status: "running",
      importedMessages: 0,
      importedThreads: 0,
      importedPeople: 0,
      lastCursor: this.database.getCursor("messages"),
      error: null,
      startedAt: now(),
      completedAt: null,
    };
    this.jobs.set(job.id, job);

    if (access.status !== "granted") {
      job.status = "failed";
      job.error = access.details;
      job.completedAt = now();
      return job;
    }

    const source = new DatabaseSync(chatDbPath, { open: true, readOnly: true });
    const cursor = this.database.getCursor("messages") ?? 0;

    try {
      const rows = source
        .prepare(`
          SELECT
            m.ROWID AS sourceMessageId,
            c.ROWID AS chatId,
            COALESCE(c.chat_identifier, CAST(c.ROWID AS TEXT)) AS chatIdentifier,
            m.text AS body,
            COALESCE(m.service, c.service_name) AS service,
            h.id AS handleValue,
            m.is_from_me AS isFromMe,
            CAST(m.date AS TEXT) AS appleDate,
            a.filename AS attachmentPath,
            a.mime_type AS attachmentMimeType,
            a.transfer_name AS attachmentTransferName
          FROM message m
          LEFT JOIN handle h ON h.ROWID = m.handle_id
          LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
          LEFT JOIN chat c ON c.ROWID = cmj.chat_id
          LEFT JOIN message_attachment_join maj ON maj.message_id = m.ROWID
          LEFT JOIN attachment a ON a.ROWID = maj.attachment_id
          WHERE m.ROWID > ?
          ORDER BY m.ROWID ASC
          LIMIT 10000
        `)
        .all(cursor) as RawMessageRow[];

      const grouped = new Map<number, RawMessageRow[]>();

      for (const row of rows) {
        const bucket = grouped.get(row.sourceMessageId) ?? [];
        bucket.push(row);
        grouped.set(row.sourceMessageId, bucket);
      }

      const seenThreads = new Set<string>();
      const seenPeople = new Set<string>();
      const importedMessageIds = new Set<string>();
      let maxCursor = cursor;

      for (const [, bucket] of grouped) {
        const first = bucket[0];
        const sourceChatId = String(first.chatId ?? `orphan_${first.sourceMessageId}`);
        const thread = this.database.upsertThread(sourceChatId, first.chatIdentifier ?? null);
        if (!seenThreads.has(thread.id)) {
          seenThreads.add(thread.id);
        }

        const isFromMe = Boolean(first.isFromMe);
        const rawHandle = isFromMe ? "me" : first.handleValue;
        const handle = normalizeHandle(rawHandle);
        const person = this.database.getOrCreatePerson(handle, isFromMe ? "You" : first.handleValue ?? "Unknown");
        if (!seenPeople.has(person.id)) {
          seenPeople.add(person.id);
        }

        if (rawHandle) {
          this.database.addParticipant(thread.id, person.id, rawHandle, first.service ?? null);
        }

        const inserted = this.database.insertMessage({
          sourceMessageId: String(first.sourceMessageId),
          threadId: thread.id,
          personId: person.id,
          body: first.body,
          occurredAt: appleTimestampToUnixMs(first.appleDate),
          isFromMe,
          attachments: bucket
            .filter((row) => row.attachmentPath)
            .map((row) => ({
              path: row.attachmentPath,
              mimeType: row.attachmentMimeType,
              transferName: row.attachmentTransferName,
            })),
          metadata: {
            sourceChatId,
            service: first.service,
            importedAt: new Date().toISOString(),
          },
        });

        if (inserted.inserted) {
          job.importedMessages += 1;
          importedMessageIds.add(inserted.messageId);
        }

        maxCursor = Math.max(maxCursor, first.sourceMessageId);
      }

      job.importedThreads = seenThreads.size;
      job.importedPeople = seenPeople.size;
      job.lastCursor = maxCursor;
      this.database.setCursor("messages", maxCursor);
      this.database.refreshSearchDocuments({
        people: [...seenPeople],
        threads: [...seenThreads],
        messages: [...importedMessageIds],
      });
      job.status = "completed";
      job.completedAt = now();
      return job;
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Unknown import failure";
      job.completedAt = now();
      return job;
    } finally {
      source.close();
    }
  }
}
