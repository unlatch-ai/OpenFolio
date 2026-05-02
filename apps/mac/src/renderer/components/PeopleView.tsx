import { useEffect, useMemo, useState } from "react";
import { Bell, Briefcase, Check, FileText, MessageSquare, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EditablePersonProfile, MessageDetail, Person, PersonAlias, PersonProfile } from "@openfolio/shared-types";
import { useAppStore } from "../store";
import { ContactAvatar } from "./ContactAvatar";
import { Button } from "./ui/button";
import {
  formatAliasLabel,
  getReminderStatusLabel,
  getReminderToggleLabel,
  normalizeAliasDraft,
  orderProfileNotes,
} from "../people-profile";

function formatDate(value: number | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "No messages";
}

function emptyProfileDraft(profile: PersonProfile | null): EditablePersonProfile {
  return {
    displayName: profile?.person.displayName ?? "",
    primaryHandle: profile?.person.primaryHandle ?? "",
    email: profile?.person.email ?? "",
    phone: profile?.person.phone ?? "",
    companyName: profile?.person.companyName ?? "",
    jobTitle: profile?.person.jobTitle ?? "",
    location: profile?.person.location ?? "",
  };
}

function messageLabel(message: MessageDetail) {
  if (message.body) return message.body;
  const attachment = message.attachments[0];
  return attachment?.transferName || attachment?.mimeType || "Attachment";
}

export function PeopleView() {
  const { selectedPersonId, selectPerson, selectThread, setView } = useAppStore();
  const [people, setPeople] = useState<Person[]>([]);
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [query, setQuery] = useState("");
  const [profileQuery, setProfileQuery] = useState("");
  const [profileResults, setProfileResults] = useState<MessageDetail[]>([]);
  const [profileResultOffset, setProfileResultOffset] = useState(0);
  const [noteDraft, setNoteDraft] = useState("");
  const [reminderDraft, setReminderDraft] = useState("");
  const [aliasDraft, setAliasDraft] = useState("");
  const [aliasKind, setAliasKind] = useState<PersonAlias["kind"]>("other");
  const [editDraft, setEditDraft] = useState<EditablePersonProfile>(emptyProfileDraft(null));
  const [loading, setLoading] = useState(true);
  const [searchingProfile, setSearchingProfile] = useState(false);

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

  async function refreshProfile(personId: string) {
    const nextProfile = await window.openfolio.people.getProfile(personId);
    setProfile(nextProfile);
    setEditDraft(emptyProfileDraft(nextProfile));
  }

  useEffect(() => {
    if (!selectedPersonId) {
      setProfile(null);
      setProfileResults([]);
      return;
    }
    refreshProfile(selectedPersonId).catch(console.error);
  }, [selectedPersonId]);

  async function runProfileSearch(nextOffset = 0) {
    if (!profile) return;
    setSearchingProfile(true);
    try {
      const rows = await window.openfolio.people.searchMessages({
        personId: profile.person.id,
        query: profileQuery,
        limit: 25,
        offset: nextOffset,
      });
      setProfileResults(nextOffset === 0 ? rows : [...profileResults, ...rows]);
      setProfileResultOffset(nextOffset);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not search messages.");
    } finally {
      setSearchingProfile(false);
    }
  }

  useEffect(() => {
    if (!profile) return;
    const timeout = window.setTimeout(() => {
      runProfileSearch(0).catch(console.error);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [profile?.person.id, profileQuery]);

  const notes = useMemo(() => orderProfileNotes(profile?.notes ?? []), [profile?.notes]);

  async function saveProfile() {
    if (!profile) return;
    try {
      const next = await window.openfolio.people.updateProfile({ personId: profile.person.id, profile: editDraft });
      setProfile(next);
      setEditDraft(emptyProfileDraft(next));
      toast.success("Profile saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save profile.");
    }
  }

  async function addAlias() {
    if (!profile) return;
    const value = normalizeAliasDraft(aliasDraft);
    if (!value) return;
    try {
      await window.openfolio.people.addAlias({ personId: profile.person.id, value, kind: aliasKind });
      setAliasDraft("");
      await refreshProfile(profile.person.id);
      toast.success("Alias added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add alias.");
    }
  }

  async function deleteAlias(aliasId: string) {
    if (!profile) return;
    await window.openfolio.people.deleteAlias({ aliasId });
    await refreshProfile(profile.person.id);
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

  async function toggleNotePin(noteId: string, pinned: boolean) {
    if (!profile) return;
    await (pinned ? window.openfolio.notes.unpin(noteId) : window.openfolio.notes.pin(noteId));
    await refreshProfile(profile.person.id);
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

  async function toggleReminder(reminderId: string, status: "open" | "done") {
    if (!profile) return;
    await window.openfolio.reminders.updateStatus({ reminderId, status: status === "done" ? "open" : "done" });
    await refreshProfile(profile.person.id);
  }

  function openMessage(message: MessageDetail) {
    setView("inbox");
    selectThread(message.threadId);
    useAppStore.getState().selectMessage(message.id);
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

            <section className="person-section">
              <h3><Briefcase size={14} /> Identity</h3>
              <div className="person-edit-grid">
                <input value={editDraft.displayName ?? ""} onChange={(event) => setEditDraft({ ...editDraft, displayName: event.target.value })} placeholder="Display name" />
                <input value={editDraft.primaryHandle ?? ""} onChange={(event) => setEditDraft({ ...editDraft, primaryHandle: event.target.value })} placeholder="Primary handle" />
                <input value={editDraft.email ?? ""} onChange={(event) => setEditDraft({ ...editDraft, email: event.target.value })} placeholder="Email" />
                <input value={editDraft.phone ?? ""} onChange={(event) => setEditDraft({ ...editDraft, phone: event.target.value })} placeholder="Phone" />
                <input value={editDraft.companyName ?? ""} onChange={(event) => setEditDraft({ ...editDraft, companyName: event.target.value })} placeholder="Company" />
                <input value={editDraft.jobTitle ?? ""} onChange={(event) => setEditDraft({ ...editDraft, jobTitle: event.target.value })} placeholder="Title" />
                <input value={editDraft.location ?? ""} onChange={(event) => setEditDraft({ ...editDraft, location: event.target.value })} placeholder="Location" />
                <Button size="xs" onClick={saveProfile}><Check size={12} /> Save</Button>
              </div>
              <div className="person-aliases">
                {profile.aliases.map((alias) => (
                  <span key={alias.id} className="person-alias-chip">
                    {formatAliasLabel(alias)}
                    <button onClick={() => deleteAlias(alias.id)} aria-label={`Delete ${alias.value}`}><Trash2 size={11} /></button>
                  </span>
                ))}
              </div>
              <div className="person-action-input">
                <select value={aliasKind} onChange={(event) => setAliasKind(event.target.value as PersonAlias["kind"])}>
                  <option value="other">Alias</option>
                  <option value="name">Name</option>
                  <option value="handle">Handle</option>
                </select>
                <input value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} placeholder="Add alternate handle or name" />
                <Button size="xs" variant="secondary" onClick={addAlias} disabled={!normalizeAliasDraft(aliasDraft)}>
                  <Plus size={12} /> Add
                </Button>
              </div>
            </section>

            <div className="person-stats-grid">
              <div><strong>{formatDate(profile.summary.firstContactAt)}</strong><span>First contact</span></div>
              <div><strong>{formatDate(profile.summary.lastContactAt)}</strong><span>Last contact</span></div>
              <div><strong>{profile.summary.cadenceLabel}</strong><span>Cadence</span></div>
              <div><strong>{profile.summary.sentReceivedLabel}</strong><span>Balance</span></div>
              <div><strong>{profile.summary.responseLabel}</strong><span>Response</span></div>
              <div><strong>{profile.digest.reminderCount}</strong><span>Open reminders</span></div>
            </div>

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
                <h3><FileText size={14} /> Message history</h3>
                <div className="person-inline-search">
                  <Search size={12} />
                  <input value={profileQuery} onChange={(event) => setProfileQuery(event.target.value)} placeholder="Search this person" />
                </div>
              </div>
              {profileResults.map((message) => (
                <button key={message.id} className="person-message-line person-message-button" onClick={() => openMessage(message)}>
                  {messageLabel(message)}
                </button>
              ))}
              {profileResults.length === 0 && <p>{searchingProfile ? "Searching..." : "No matching messages."}</p>}
              {profileResults.length > 0 && (
                <Button size="xs" variant="secondary" onClick={() => runProfileSearch(profileResultOffset + 25)} disabled={searchingProfile}>
                  Load more
                </Button>
              )}
            </section>

            <section className="person-section">
              <h3><Bell size={14} /> Notes and reminders</h3>
              <div className="person-action-grid">
                <div className="person-action-input">
                  <input value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add a private note" />
                  <Button size="xs" onClick={addNote} disabled={!noteDraft.trim()}><Plus size={12} /> Note</Button>
                </div>
                <div className="person-action-input">
                  <input value={reminderDraft} onChange={(event) => setReminderDraft(event.target.value)} placeholder="Add a follow-up reminder" />
                  <Button size="xs" variant="secondary" onClick={addReminder} disabled={!reminderDraft.trim()}><Plus size={12} /> Reminder</Button>
                </div>
              </div>
              {notes.map((note) => (
                <div key={note.id} className={`person-note-row ${note.pinned ? "pinned" : ""}`}>
                  <p>{note.content}</p>
                  <Button size="xs" variant="ghost" onClick={() => toggleNotePin(note.id, note.pinned)}>
                    {note.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                    {note.pinned ? "Unpin" : "Pin"}
                  </Button>
                </div>
              ))}
              {profile.reminders.map((reminder) => (
                <div key={reminder.id} className={`person-reminder-row ${reminder.status}`}>
                  <span>{reminder.title}</span>
                  <small>{getReminderStatusLabel(reminder)}</small>
                  <Button size="xs" variant="secondary" onClick={() => toggleReminder(reminder.id, reminder.status)}>
                    {getReminderToggleLabel(reminder)}
                  </Button>
                </div>
              ))}
              {notes.length === 0 && profile.reminders.length === 0 && <p>No notes or reminders yet.</p>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
