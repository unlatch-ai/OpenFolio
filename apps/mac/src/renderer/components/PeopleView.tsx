import { useEffect, useState } from "react";
import { Bell, Briefcase, FileText, MessageSquare, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { Person, PersonProfile } from "@openfolio/shared-types";
import { useAppStore } from "../store";
import { ContactAvatar } from "./ContactAvatar";
import { Button } from "./ui/button";

function formatDate(value: number | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "No messages";
}

export function PeopleView() {
  const { selectedPersonId, selectPerson, selectThread, setView } = useAppStore();
  const [people, setPeople] = useState<Person[]>([]);
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [query, setQuery] = useState("");
  const [profileQuery, setProfileQuery] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [reminderDraft, setReminderDraft] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.openfolio.people
      .list({ limit: 100, query })
      .then((rows) => {
        setPeople(rows);
        if (!selectedPersonId && rows[0]) {
          selectPerson(rows[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [query, selectPerson, selectedPersonId]);

  useEffect(() => {
    if (!selectedPersonId) {
      setProfile(null);
      return;
    }
    window.openfolio.people.getProfile(selectedPersonId).then(setProfile).catch(console.error);
  }, [selectedPersonId]);

  const recentMessages = profile?.recentMessages.filter((message) => {
    if (!profileQuery.trim()) return true;
    return (message.body || "").toLowerCase().includes(profileQuery.trim().toLowerCase());
  }) ?? [];

  async function refreshProfile(personId: string) {
    const nextProfile = await window.openfolio.people.getProfile(personId);
    setProfile(nextProfile);
  }

  async function addNote() {
    if (!profile || !noteDraft.trim()) return;
    try {
      await window.openfolio.people.addNote({ personId: profile.person.id, content: noteDraft.trim() });
      setNoteDraft("");
      await refreshProfile(profile.person.id);
      toast.success("Note added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add note.");
    }
  }

  async function addReminder() {
    if (!profile || !reminderDraft.trim()) return;
    try {
      await window.openfolio.people.addReminder({ personId: profile.person.id, title: reminderDraft.trim(), dueAt: null });
      setReminderDraft("");
      await refreshProfile(profile.person.id);
      toast.success("Reminder added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add reminder.");
    }
  }

  return (
    <div className="people-layout">
      <div className="people-list">
        <div className="people-list-header">
          <h2>People</h2>
          <div className="people-search">
            <Search size={13} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a person" />
          </div>
        </div>
        <div className="people-list-scroll">
          {loading && <p className="people-empty">Loading people...</p>}
          {!loading && people.length === 0 && <p className="people-empty">Sync contacts or import messages to see people.</p>}
          {people.map((person) => (
            <button
              key={person.id}
              className={`people-row ${selectedPersonId === person.id ? "active" : ""}`}
              onClick={() => selectPerson(person.id)}
            >
              <ContactAvatar name={person.displayName} size={34} />
              <span>
                <strong>{person.displayName}</strong>
                <small>{person.email || person.phone || person.primaryHandle || "No handle"}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="person-profile">
        {!profile ? (
          <div className="inbox-detail-empty">
            <MessageSquare size={24} className="text-muted-foreground/40" />
            <p>Select a person</p>
          </div>
        ) : (
          <div className="person-profile-scroll">
            <div className="person-header">
              <ContactAvatar name={profile.person.displayName} size={56} />
              <div>
                <h2>{profile.person.displayName}</h2>
                <p>{profile.person.email || profile.person.phone || profile.person.primaryHandle || "No primary handle"}</p>
              </div>
            </div>

            <div className="person-stats-grid">
              <div><strong>{profile.digest.messageCount}</strong><span>Messages</span></div>
              <div><strong>{profile.stats?.streakWeeks ?? 0}</strong><span>Week streak</span></div>
              <div><strong>{profile.digest.noteCount}</strong><span>Notes</span></div>
              <div><strong>{profile.digest.reminderCount}</strong><span>Reminders</span></div>
            </div>

            {(profile.person.companyName || profile.person.jobTitle || profile.person.location) && (
              <section className="person-section">
                <h3><Briefcase size={14} /> Details</h3>
                <p>{[profile.person.jobTitle, profile.person.companyName, profile.person.location].filter(Boolean).join(" · ")}</p>
              </section>
            )}

            <section className="person-section">
              <h3><MessageSquare size={14} /> Conversations</h3>
              {profile.threads.map((thread) => (
                <button
                  key={thread.threadId}
                  className="person-thread-row"
                  onClick={() => {
                    setView("inbox");
                    selectThread(thread.threadId);
                  }}
                >
                  <span>{thread.title}</span>
                  <small>{formatDate(thread.lastMessageAt)}</small>
                </button>
              ))}
            </section>

            <section className="person-section">
              <div className="person-section-heading-row">
                <h3><FileText size={14} /> Recent messages</h3>
                <div className="person-inline-search">
                  <Search size={12} />
                  <input value={profileQuery} onChange={(event) => setProfileQuery(event.target.value)} placeholder="Search this person" />
                </div>
              </div>
              {recentMessages.slice(0, 10).map((message) => (
                <button
                  key={message.id}
                  className="person-message-line person-message-button"
                  onClick={() => {
                    setView("inbox");
                    selectThread(message.threadId);
                    useAppStore.getState().selectMessage(message.id);
                  }}
                >
                  {message.body || "Attachment"}
                </button>
              ))}
              {recentMessages.length === 0 && <p>No matching messages.</p>}
            </section>

            <section className="person-section">
              <h3><Bell size={14} /> Notes and reminders</h3>
              <div className="person-action-grid">
                <div className="person-action-input">
                  <input value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add a private note" />
                  <Button size="xs" onClick={addNote} disabled={!noteDraft.trim()}>
                    <Plus size={12} />
                    Note
                  </Button>
                </div>
                <div className="person-action-input">
                  <input value={reminderDraft} onChange={(event) => setReminderDraft(event.target.value)} placeholder="Add a follow-up reminder" />
                  <Button size="xs" variant="secondary" onClick={addReminder} disabled={!reminderDraft.trim()}>
                    <Plus size={12} />
                    Reminder
                  </Button>
                </div>
              </div>
              {[...profile.notes.map((note) => note.content), ...profile.reminders.map((reminder) => reminder.title)].length === 0 ? (
                <p>No notes or reminders yet.</p>
              ) : (
                [...profile.notes.map((note) => note.content), ...profile.reminders.map((reminder) => reminder.title)].map((item, index) => (
                  <p key={`${item}-${index}`} className="person-message-line">{item}</p>
                ))
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
