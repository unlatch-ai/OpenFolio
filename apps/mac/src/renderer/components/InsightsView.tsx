import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Users,
  Calendar,
  Clock,
  MessageSquare,
  Flame,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { ContactAvatar } from "./ContactAvatar";
import { Button } from "./ui/button";
import type {
  WrappedSummary,
  RelationshipStats,
  MessageHeatmapEntry,
} from "@openfolio/shared-types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return "12a";
  if (i < 12) return `${i}a`;
  if (i === 12) return "12p";
  return `${i - 12}p`;
});

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatResponseTime(ms: number | null): string {
  if (ms == null) return "--";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/* ─── Stat card ─── */
function StatCard({
  icon: Icon,
  gradient,
  value,
  label,
}: {
  icon: typeof Users;
  gradient: string;
  value: string;
  label: string;
}) {
  return (
    <motion.div
      className="insight-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="insight-card-icon" style={{ background: gradient }}>
        <Icon size={20} color="white" />
      </div>
      <div className="insight-card-info">
        <span className="insight-card-value">{value}</span>
        <span className="insight-card-label">{label}</span>
      </div>
    </motion.div>
  );
}

/* ─── Top contacts list ─── */
function TopContactsList({ contacts }: { contacts: RelationshipStats[] }) {
  if (contacts.length === 0) return null;

  return (
    <div className="insights-section">
      <h3>Your top people</h3>
      <div className="top-contacts-list">
        {contacts.map((contact, i) => (
          <motion.div
            key={contact.personId}
            className="top-contact-row"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
          >
            <span className="top-contact-rank">#{i + 1}</span>
            <ContactAvatar name={contact.displayName} size={34} />
            <div className="top-contact-info">
              <span className="top-contact-name">{contact.displayName}</span>
              <span className="top-contact-meta">
                {formatNumber(contact.totalMessages)} messages
                {contact.streakWeeks > 0 && ` · ${contact.streakWeeks}w streak`}
              </span>
            </div>
            <div className="top-contact-stats">
              <span className="top-contact-sent">{formatNumber(contact.sentByMe)} sent</span>
              <span className="top-contact-response">
                {formatResponseTime(contact.avgResponseTimeMs)} avg reply
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Monthly volume chart ─── */
function MonthlyChart({ data }: { data: Array<{ month: string; count: number }> }) {
  if (data.length === 0) return null;

  const chartData = data.map((d) => ({
    name: d.month.slice(5), // "01", "02", etc.
    messages: d.count,
  }));

  return (
    <div className="insights-section">
      <h3>Messages by month</h3>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="msgGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <RechartsTooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                boxShadow: "var(--shadow-md)",
              }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 500 }}
              itemStyle={{ color: "var(--muted-foreground)" }}
            />
            <Area
              type="monotone"
              dataKey="messages"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#msgGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── Day-of-week chart ─── */
function DayOfWeekChart({ data }: { data: number[] }) {
  const total = data.reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;

  const chartData = data.map((count, i) => ({
    name: DAY_LABELS[i],
    messages: count,
  }));

  return (
    <div className="insights-section">
      <h3>Activity by day</h3>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <RechartsTooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                boxShadow: "var(--shadow-md)",
              }}
            />
            <Bar dataKey="messages" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── Heatmap (GitHub-style contribution graph) ─── */
function MessageHeatmap({ data, year }: { data: MessageHeatmapEntry[]; year: number }) {
  if (data.length === 0) return null;

  // Build a lookup map
  const countMap = new Map(data.map((d) => [d.date, d.count]));
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  // Generate all weeks for the year
  const startDate = new Date(year, 0, 1);
  // Adjust to start on Sunday
  const startDay = startDate.getDay();
  const adjustedStart = new Date(startDate);
  adjustedStart.setDate(adjustedStart.getDate() - startDay);

  const weeks: Array<Array<{ date: string; count: number; inYear: boolean }>> = [];
  const cursor = new Date(adjustedStart);
  let currentWeek: Array<{ date: string; count: number; inYear: boolean }> = [];

  while (cursor.getFullYear() <= year || (cursor.getFullYear() === year + 1 && cursor.getMonth() === 0 && cursor.getDate() <= 7)) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const count = countMap.get(dateStr) ?? 0;
    const inYear = cursor.getFullYear() === year;

    currentWeek.push({ date: dateStr, count, inYear });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    cursor.setDate(cursor.getDate() + 1);

    if (weeks.length >= 53) break;
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  function getColor(count: number, inYear: boolean): string {
    if (!inYear) return "transparent";
    if (count === 0) return "var(--muted)";
    const intensity = Math.min(count / maxCount, 1);
    if (intensity < 0.25) return "var(--primary-light, rgba(233, 93, 58, 0.2))";
    if (intensity < 0.5) return "var(--primary-mid, rgba(233, 93, 58, 0.4))";
    if (intensity < 0.75) return "var(--primary-high, rgba(233, 93, 58, 0.7))";
    return "var(--primary)";
  }

  return (
    <div className="insights-section">
      <h3>Message activity</h3>
      <div className="heatmap-container">
        <div className="heatmap-grid">
          {weeks.map((week, wi) => (
            <div key={wi} className="heatmap-week">
              {week.map((day) => (
                <div
                  key={day.date}
                  className="heatmap-cell"
                  style={{ background: getColor(day.count, day.inYear) }}
                  title={day.inYear ? `${day.date}: ${day.count} messages` : ""}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="heatmap-legend">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((level) => (
            <div
              key={level}
              className="heatmap-cell"
              style={{
                background:
                  level === 0
                    ? "var(--muted)"
                    : level < 0.5
                      ? "rgba(233, 93, 58, 0.3)"
                      : level < 1
                        ? "rgba(233, 93, 58, 0.6)"
                        : "var(--primary)",
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Insights View ─── */
export function InsightsView() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [wrapped, setWrapped] = useState<WrappedSummary | null>(null);
  const [heatmap, setHeatmap] = useState<MessageHeatmapEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (targetYear: number) => {
    setLoading(true);
    try {
      const [w, h] = await Promise.all([
        window.openfolio.insights.getWrappedSummary(targetYear),
        window.openfolio.insights.getMessageHeatmap(targetYear),
      ]);
      setWrapped(w);
      setHeatmap(h);
    } catch (error) {
      console.error("[insights] Failed to load:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(year);
  }, [year, loadData]);

  if (loading) {
    return (
      <div className="insights-view">
        <div className="insights-header">
          <h2>Insights</h2>
        </div>
        <div className="insights-loading">
          <div className="thread-panel-loading-dot" />
          <span>Crunching your numbers...</span>
        </div>
      </div>
    );
  }

  if (!wrapped || wrapped.totalMessages === 0) {
    return (
      <div className="insights-view">
        <div className="insights-header">
          <h2>Insights</h2>
          <p>Import your messages to see your relationship stats.</p>
        </div>
        <div className="inbox-empty">
          <div className="inbox-empty-card">
            <div className="inbox-empty-icon">
              <BarChart3 size={32} />
            </div>
            <h2>No data yet</h2>
            <p>Import your iMessage history from Settings to unlock your Wrapped experience.</p>
          </div>
        </div>
      </div>
    );
  }

  const busiestHourLabel = wrapped.busiestHour
    ? HOUR_LABELS[wrapped.busiestHour.hour]
    : "--";

  return (
    <div className="insights-view">
      {/* Header with year selector */}
      <div className="insights-header">
        <div>
          <h2>Your {year} Wrapped</h2>
          <p>
            {formatNumber(wrapped.totalMessages)} messages across{" "}
            {formatNumber(wrapped.totalConversations)} conversations
          </p>
        </div>
        <div className="year-selector">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setYear((y) => y - 1)}
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="year-label">{year}</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setYear((y) => Math.min(y + 1, currentYear))}
            disabled={year >= currentYear}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="insights-grid">
        <StatCard
          icon={MessageSquare}
          gradient="var(--gradient-warm)"
          value={formatNumber(wrapped.totalMessages)}
          label="Total messages"
        />
        <StatCard
          icon={Users}
          gradient="var(--gradient-cool)"
          value={formatNumber(wrapped.totalConversations)}
          label="Conversations"
        />
        <StatCard
          icon={TrendingUp}
          gradient="var(--gradient-sunset)"
          value={String(wrapped.avgDailyMessages)}
          label="Daily average"
        />
        <StatCard
          icon={Clock}
          gradient="var(--gradient-ocean)"
          value={busiestHourLabel}
          label="Peak hour"
        />
      </div>

      {/* Heatmap */}
      <MessageHeatmap data={heatmap} year={year} />

      {/* Monthly trend */}
      <MonthlyChart data={wrapped.messagesByMonth} />

      {/* Day of week */}
      <DayOfWeekChart data={wrapped.messagesByDayOfWeek} />

      {/* Top contacts */}
      <TopContactsList contacts={wrapped.topContacts} />
    </div>
  );
}
