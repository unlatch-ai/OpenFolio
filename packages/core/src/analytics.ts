import type { OpenFolioDatabase } from "./db.js";

export interface RelationshipStats {
  personId: string;
  displayName: string;
  totalMessages: number;
  sentByMe: number;
  sentByThem: number;
  avgResponseTimeMs: number | null;
  firstMessageAt: number | null;
  lastMessageAt: number | null;
  messagesByMonth: Array<{ month: string; count: number }>;
  messagesByHour: number[];
  streakWeeks: number;
}

export interface WrappedSummary {
  periodLabel: string;
  totalMessages: number;
  totalConversations: number;
  topContacts: RelationshipStats[];
  busiestMonth: { month: string; count: number } | null;
  busiestHour: { hour: number; count: number } | null;
  avgDailyMessages: number;
  messagesByMonth: Array<{ month: string; count: number }>;
  messagesByDayOfWeek: number[];
}

export interface MessageHeatmapEntry {
  date: string;
  count: number;
}

type DbRow = Record<string, unknown>;

/**
 * Pure SQL analytics engine. Derives all stats from existing
 * message_messages and message_participants tables.
 * No new schema required.
 */
export class AnalyticsEngine {
  constructor(private readonly db: OpenFolioDatabase) {}

  getRelationshipStats(personId: string): RelationshipStats | null {
    const person = this.db.getPerson(personId);
    if (!person) return null;

    const counts = this.db.query<DbRow>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN mm.is_from_me = 1 THEN 1 ELSE 0 END) AS sentByMe,
        SUM(CASE WHEN mm.is_from_me = 0 THEN 1 ELSE 0 END) AS sentByThem,
        MIN(mm.occurred_at) AS firstMessageAt,
        MAX(mm.occurred_at) AS lastMessageAt
      FROM message_messages mm
      JOIN message_participants mp ON mp.thread_id = mm.thread_id AND mp.person_id = ?
      WHERE mm.body IS NOT NULL
    `, personId);

    const row = counts[0];
    if (!row || Number(row.total) === 0) {
      return {
        personId,
        displayName: person.displayName,
        totalMessages: 0,
        sentByMe: 0,
        sentByThem: 0,
        avgResponseTimeMs: null,
        firstMessageAt: null,
        lastMessageAt: null,
        messagesByMonth: [],
        messagesByHour: new Array(24).fill(0),
        streakWeeks: 0,
      };
    }

    const monthRows = this.db.query<DbRow>(`
      SELECT
        strftime('%Y-%m', datetime(mm.occurred_at / 1000, 'unixepoch')) AS month,
        COUNT(*) AS count
      FROM message_messages mm
      JOIN message_participants mp ON mp.thread_id = mm.thread_id AND mp.person_id = ?
      WHERE mm.body IS NOT NULL
      GROUP BY month
      ORDER BY month ASC
    `, personId);

    const hourRows = this.db.query<DbRow>(`
      SELECT
        CAST(strftime('%H', datetime(mm.occurred_at / 1000, 'unixepoch', 'localtime')) AS INTEGER) AS hour,
        COUNT(*) AS count
      FROM message_messages mm
      JOIN message_participants mp ON mp.thread_id = mm.thread_id AND mp.person_id = ?
      WHERE mm.body IS NOT NULL
      GROUP BY hour
    `, personId);

    const messagesByHour = new Array(24).fill(0);
    for (const h of hourRows) {
      messagesByHour[Number(h.hour)] = Number(h.count);
    }

    const avgResponseTime = this.computeAvgResponseTime(personId);
    const streakWeeks = this.computeStreakWeeks(personId);

    return {
      personId,
      displayName: person.displayName,
      totalMessages: Number(row.total),
      sentByMe: Number(row.sentByMe),
      sentByThem: Number(row.sentByThem),
      avgResponseTimeMs: avgResponseTime,
      firstMessageAt: row.firstMessageAt != null ? Number(row.firstMessageAt) : null,
      lastMessageAt: row.lastMessageAt != null ? Number(row.lastMessageAt) : null,
      messagesByMonth: monthRows.map((r) => ({
        month: String(r.month),
        count: Number(r.count),
      })),
      messagesByHour,
      streakWeeks,
    };
  }

  getTopContacts(limit = 10): RelationshipStats[] {
    const rows = this.db.query<DbRow>(`
      SELECT
        mp.person_id AS personId,
        COUNT(*) AS total
      FROM message_messages mm
      JOIN message_participants mp ON mp.thread_id = mm.thread_id
      WHERE mm.body IS NOT NULL
        AND mp.person_id IS NOT NULL
      GROUP BY mp.person_id
      ORDER BY total DESC
      LIMIT ?
    `, limit);

    return rows
      .map((r) => this.getRelationshipStats(String(r.personId)))
      .filter((s): s is RelationshipStats => s !== null);
  }

  getWrappedSummary(year?: number): WrappedSummary {
    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const startMs = Date.UTC(targetYear, 0, 1);
    const endMs = Date.UTC(targetYear + 1, 0, 1);

    const totals = this.db.query<DbRow>(`
      SELECT
        COUNT(*) AS totalMessages,
        COUNT(DISTINCT mm.thread_id) AS totalConversations
      FROM message_messages mm
      WHERE mm.occurred_at >= ? AND mm.occurred_at < ?
        AND mm.body IS NOT NULL
    `, startMs, endMs);

    const totalRow = totals[0] ?? { totalMessages: 0, totalConversations: 0 };

    const monthRows = this.db.query<DbRow>(`
      SELECT
        strftime('%Y-%m', datetime(mm.occurred_at / 1000, 'unixepoch')) AS month,
        COUNT(*) AS count
      FROM message_messages mm
      WHERE mm.occurred_at >= ? AND mm.occurred_at < ?
        AND mm.body IS NOT NULL
      GROUP BY month
      ORDER BY month ASC
    `, startMs, endMs);

    const hourRows = this.db.query<DbRow>(`
      SELECT
        CAST(strftime('%H', datetime(mm.occurred_at / 1000, 'unixepoch', 'localtime')) AS INTEGER) AS hour,
        COUNT(*) AS count
      FROM message_messages mm
      WHERE mm.occurred_at >= ? AND mm.occurred_at < ?
        AND mm.body IS NOT NULL
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 1
    `, startMs, endMs);

    const dowRows = this.db.query<DbRow>(`
      SELECT
        CAST(strftime('%w', datetime(mm.occurred_at / 1000, 'unixepoch', 'localtime')) AS INTEGER) AS dow,
        COUNT(*) AS count
      FROM message_messages mm
      WHERE mm.occurred_at >= ? AND mm.occurred_at < ?
        AND mm.body IS NOT NULL
      GROUP BY dow
    `, startMs, endMs);

    const messagesByDayOfWeek = new Array(7).fill(0);
    for (const d of dowRows) {
      messagesByDayOfWeek[Number(d.dow)] = Number(d.count);
    }

    // Top contacts for the period
    const topRows = this.db.query<DbRow>(`
      SELECT
        mp.person_id AS personId,
        COUNT(*) AS total
      FROM message_messages mm
      JOIN message_participants mp ON mp.thread_id = mm.thread_id
      WHERE mm.occurred_at >= ? AND mm.occurred_at < ?
        AND mm.body IS NOT NULL
        AND mp.person_id IS NOT NULL
      GROUP BY mp.person_id
      ORDER BY total DESC
      LIMIT 5
    `, startMs, endMs);

    const topContacts = topRows
      .map((r) => this.getRelationshipStats(String(r.personId)))
      .filter((s): s is RelationshipStats => s !== null);

    const busiestMonth = monthRows.length > 0
      ? monthRows.reduce((max, r) => Number(r.count) > Number(max.count) ? r : max, monthRows[0])
      : null;

    const busiestHour = hourRows[0] ?? null;

    const daySpan = Math.max(1, (endMs - startMs) / (1000 * 60 * 60 * 24));
    const totalMessages = Number(totalRow.totalMessages);

    return {
      periodLabel: String(targetYear),
      totalMessages,
      totalConversations: Number(totalRow.totalConversations),
      topContacts,
      busiestMonth: busiestMonth
        ? { month: String(busiestMonth.month), count: Number(busiestMonth.count) }
        : null,
      busiestHour: busiestHour
        ? { hour: Number(busiestHour.hour), count: Number(busiestHour.count) }
        : null,
      avgDailyMessages: Math.round(totalMessages / daySpan),
      messagesByMonth: monthRows.map((r) => ({
        month: String(r.month),
        count: Number(r.count),
      })),
      messagesByDayOfWeek,
    };
  }

  getMessageHeatmap(year?: number): MessageHeatmapEntry[] {
    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const startMs = Date.UTC(targetYear, 0, 1);
    const endMs = Date.UTC(targetYear + 1, 0, 1);

    const rows = this.db.query<DbRow>(`
      SELECT
        strftime('%Y-%m-%d', datetime(mm.occurred_at / 1000, 'unixepoch', 'localtime')) AS date,
        COUNT(*) AS count
      FROM message_messages mm
      WHERE mm.occurred_at >= ? AND mm.occurred_at < ?
        AND mm.body IS NOT NULL
      GROUP BY date
      ORDER BY date ASC
    `, startMs, endMs);

    return rows.map((r) => ({
      date: String(r.date),
      count: Number(r.count),
    }));
  }

  private computeAvgResponseTime(personId: string): number | null {
    // For each incoming message from the person, find the next outgoing message
    // in the same thread within 24 hours. The response time is the delta.
    const rows = this.db.query<DbRow>(`
      SELECT
        mm.occurred_at AS incomingAt,
        (
          SELECT MIN(reply.occurred_at)
          FROM message_messages reply
          WHERE reply.thread_id = mm.thread_id
            AND reply.is_from_me = 1
            AND reply.occurred_at > mm.occurred_at
            AND reply.occurred_at < mm.occurred_at + 86400000
        ) AS replyAt
      FROM message_messages mm
      JOIN message_participants mp ON mp.thread_id = mm.thread_id AND mp.person_id = ?
      WHERE mm.is_from_me = 0 AND mm.person_id = ?
      ORDER BY mm.occurred_at DESC
      LIMIT 200
    `, personId, personId);

    const deltas: number[] = [];
    for (const r of rows) {
      if (r.replyAt != null) {
        deltas.push(Number(r.replyAt) - Number(r.incomingAt));
      }
    }

    if (deltas.length === 0) return null;

    // Return median, not mean, to avoid outlier skew
    deltas.sort((a, b) => a - b);
    const mid = Math.floor(deltas.length / 2);
    return deltas.length % 2 === 0
      ? Math.round((deltas[mid - 1] + deltas[mid]) / 2)
      : deltas[mid];
  }

  private computeStreakWeeks(personId: string): number {
    const rows = this.db.query<DbRow>(`
      SELECT DISTINCT
        strftime('%Y-%W', datetime(mm.occurred_at / 1000, 'unixepoch', 'localtime')) AS week
      FROM message_messages mm
      JOIN message_participants mp ON mp.thread_id = mm.thread_id AND mp.person_id = ?
      WHERE mm.body IS NOT NULL
      ORDER BY week DESC
    `, personId);

    if (rows.length === 0) return 0;

    // Count consecutive weeks from now backwards
    let streak = 0;
    const now = new Date();
    const currentWeek = `${now.getFullYear()}-${String(getISOWeek(now)).padStart(2, "0")}`;

    const weekSet = new Set(rows.map((r) => String(r.week)));

    // Walk backwards from current week
    const d = new Date(now);
    for (let i = 0; i < 200; i++) {
      const weekStr = `${d.getFullYear()}-${String(getISOWeek(d)).padStart(2, "0")}`;
      if (weekSet.has(weekStr)) {
        streak++;
      } else if (i > 0) {
        // Allow skipping the current week if it just started
        break;
      }
      d.setDate(d.getDate() - 7);
    }

    return streak;
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
