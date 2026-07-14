import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MessageHeatmapEntry, WrappedSummary } from "@openfolio/shared-types";
import { useAppStore } from "../store";
import { personColor } from "./ContactAvatar";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function monthName(value: string) {
  const index = Number(value.split("-").at(-1)) - 1;
  return MONTHS[index] || value;
}

function Strata({ data }: { data: WrappedSummary["messagesByMonth"] }) {
  const max = Math.max(...data.map((entry) => entry.count), 1);
  return <div className="wrapped-strata" role="img" aria-label={`Monthly message counts: ${data.map((entry) => `${monthName(entry.month)} ${entry.count}`).join(", ")}`}>{data.map((entry) => <span key={entry.month} style={{ height: `${Math.max(3, entry.count / max * 100)}%` }}><i>{entry.count.toLocaleString()}</i></span>)}</div>;
}

function Heatmap({ data }: { data: MessageHeatmapEntry[] }) {
  const max = Math.max(...data.map((entry) => entry.count), 1);
  const activeDays = data.filter((entry) => entry.count > 0);
  return <section className="wrapped-module"><p className="eyebrow">Activity calendar</p><h2>{activeDays.length.toLocaleString()} days with messages</h2><div className="archive-heatmap" role="img" aria-label={`${activeDays.length} active days; busiest recorded day had ${max} messages`}>{data.map((entry) => <span key={entry.date} title={`${entry.date}: ${entry.count} messages`} style={{ "--heat": String(entry.count / max) } as React.CSSProperties} />)}</div><details className="accessible-data"><summary>Read daily counts</summary><ul>{activeDays.map((entry) => <li key={entry.date}><time dateTime={entry.date}>{entry.date}</time>: {entry.count.toLocaleString()} messages</li>)}</ul></details></section>;
}

export function InsightsView() {
  const now = new Date().getFullYear();
  const [year, setYear] = useState(now);
  const [wrapped, setWrapped] = useState<WrappedSummary | null>(null);
  const [heatmap, setHeatmap] = useState<MessageHeatmapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { setView, selectPerson } = useAppStore();
  const load = useCallback(async (value: number) => { setLoading(true); try { const [summary, days] = await Promise.all([window.openfolio.insights.getWrappedSummary(value), window.openfolio.insights.getMessageHeatmap(value)]); setWrapped(summary); setHeatmap(days); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(year); }, [load, year]);
  const busiestDay = useMemo(() => wrapped ? wrapped.messagesByDayOfWeek.reduce((best, value, index, values) => value > values[best] ? index : best, 0) : 0, [wrapped]);

  if (loading) return <main className="wrapped-view"><header className="wrapped-header"><Skeleton className="wrapped-title-skeleton" /></header><Skeleton className="wrapped-artifact-skeleton" /></main>;
  if (!wrapped || wrapped.totalMessages === 0) return <main className="wrapped-view"><header className="wrapped-header"><p className="eyebrow">Your archive in {year}</p><h1>Wrapped</h1><div className="year-nav"><Button variant="ghost" onClick={() => setYear(year - 1)} aria-label="Previous year"><ChevronLeft /></Button><span>{year}</span><Button variant="ghost" onClick={() => setYear(Math.min(now, year + 1))} disabled={year === now} aria-label="Next year"><ChevronRight /></Button></div></header><div className="archive-empty"><h2>No messages recorded in {year}.</h2><p>Choose another year. Wrapped only describes records in your local archive.</p></div></main>;

  return <main className="wrapped-view"><header className="wrapped-header"><div><p className="eyebrow">Your archive in {year}</p><h1>Wrapped</h1></div><div className="year-nav"><Button variant="ghost" onClick={() => setYear(year - 1)} aria-label="Previous year"><ChevronLeft /></Button><span>{year}</span><Button variant="ghost" onClick={() => setYear(Math.min(now, year + 1))} disabled={year === now} aria-label="Next year"><ChevronRight /></Button></div></header><article className="wrapped-artifact"><section className="wrapped-opening"><p>{wrapped.totalMessages.toLocaleString()} messages across {wrapped.totalConversations.toLocaleString()} conversations</p><h2>{wrapped.busiestMonth ? `This was a ${monthName(wrapped.busiestMonth.month)} year.` : `Your ${year} archive.`}</h2>{wrapped.busiestMonth && <p>{monthName(wrapped.busiestMonth.month)} held {wrapped.busiestMonth.count.toLocaleString()} messages, the busiest month in the archive for this year.</p>}<Strata data={wrapped.messagesByMonth} /></section><div className="wrapped-grid"><section className="wrapped-module"><p className="eyebrow">Measured totals</p><dl className="wrapped-totals"><div><dt>Messages</dt><dd>{wrapped.totalMessages.toLocaleString()}</dd></div><div><dt>Conversations</dt><dd>{wrapped.totalConversations.toLocaleString()}</dd></div><div><dt>Daily average</dt><dd>{wrapped.avgDailyMessages.toLocaleString()}</dd></div></dl></section><section className="wrapped-module"><p className="eyebrow">Daily rhythm</p><h2>{DAYS[busiestDay]} was the busiest weekday.</h2><ul className="rhythm-list">{wrapped.messagesByDayOfWeek.map((count, index) => <li key={DAYS[index]}><span>{DAYS[index]}</span><i style={{ width: `${Math.max(2, count / Math.max(...wrapped.messagesByDayOfWeek, 1) * 100)}%` }} /><strong>{count.toLocaleString()}</strong></li>)}</ul></section><section className="wrapped-module top-people"><p className="eyebrow">Top people</p>{wrapped.topContacts.map((person, index) => <button key={person.personId} onClick={() => { selectPerson(person.personId); setView("people"); }}><span>{String(index + 1).padStart(2, "0")}</span><i style={{ background: personColor(person.personId) }} /><strong>{person.displayName}</strong><em>{person.totalMessages.toLocaleString()}</em></button>)}</section><Heatmap data={heatmap} /></div></article></main>;
}
