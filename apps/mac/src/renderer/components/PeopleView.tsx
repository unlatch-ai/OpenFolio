import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Edit3, MessageSquare, Search } from "lucide-react";
import type {
  EditablePersonProfile,
  Person,
  PersonProfile,
} from "@openfolio/shared-types";
import { toast } from "sonner";
import { useAppStore } from "../store";
import { ContactAvatar, personColor } from "./ContactAvatar";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { FolioMark } from "./FolioMark";

function dateLabel(value: number | null) {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No recorded messages";
}

function MessageStrata({ profile }: { profile: PersonProfile }) {
  const values =
    profile.stats?.messagesByMonth.map((entry) => entry.count) ?? [];
  const max = Math.max(...values, 1);
  return (
    <div
      className="message-strata"
      role="img"
      aria-label={`${profile.digest.messageCount.toLocaleString()} messages across ${values.length} monthly intervals`}
    >
      {values.slice(-24).map((value, index) => (
        <span
          key={index}
          style={{
            height: `${Math.max(4, (value / max) * 100)}%`,
            background:
              index === values.slice(-24).length - 1
                ? personColor(profile.person.id)
                : undefined,
          }}
        />
      ))}
    </div>
  );
}

function PersonDossier({
  profile,
  onBack,
}: {
  profile: PersonProfile;
  onBack: () => void;
}) {
  const { selectThread, selectMessage, setView, navigateToSearch } =
    useAppStore();
  const [draft, setDraft] = useState<EditablePersonProfile>({});
  const [editing, setEditing] = useState(false);
  useEffect(
    () =>
      setDraft({
        displayName: profile.person.displayName,
        primaryHandle: profile.person.primaryHandle,
        email: profile.person.email,
        phone: profile.person.phone,
        companyName: profile.person.companyName,
        jobTitle: profile.person.jobTitle,
        location: profile.person.location,
      }),
    [profile],
  );

  const save = async () => {
    await window.openfolio.people.updateProfile({
      personId: profile.person.id,
      profile: draft,
    });
    setEditing(false);
    toast.success("Identity updated");
  };

  return (
    <article
      className="person-dossier"
      style={
        {
          "--person-color": personColor(profile.person.id),
        } as React.CSSProperties
      }
    >
      <header className="dossier-header">
        <button
          className="mobile-back icon-button"
          onClick={onBack}
          aria-label="Back to people"
        >
          <ArrowLeft />
        </button>
        <FolioMark number="02A" label="PERSON DOSSIER" />
        <div className="dossier-kicker">PERSON DOSSIER</div>
        <div className="dossier-identity">
          <ContactAvatar
            name={
              profile.person.displayName ||
              profile.person.primaryHandle ||
              "Unknown contact"
            }
            personId={profile.person.id}
            size={64}
          />
          <div>
            <h1>{profile.person.displayName || "Unknown contact"}</h1>
            <p>
              {profile.person.email ||
                profile.person.phone ||
                profile.person.primaryHandle ||
                "Unknown contact"}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => setEditing((value) => !value)}
          >
            <Edit3 data-icon="inline-start" />
            Edit identity
          </Button>
        </div>
        <MessageStrata profile={profile} />
        <p className="dossier-summary">
          {profile.digest.messageCount.toLocaleString()} messages ·{" "}
          {dateLabel(profile.summary.firstContactAt)}–
          {dateLabel(profile.summary.lastContactAt)}
        </p>
      </header>
      <section className="dossier-facts" aria-label="Measured archive facts">
        <div>
          <span>First recorded</span>
          <strong>{dateLabel(profile.summary.firstContactAt)}</strong>
        </div>
        <div>
          <span>Last recorded</span>
          <strong>{dateLabel(profile.summary.lastContactAt)}</strong>
        </div>
        <div>
          <span>Measured rhythm</span>
          <strong>{profile.summary.cadenceLabel}</strong>
        </div>
        <div>
          <span>Sent / received</span>
          <strong>{profile.summary.sentReceivedLabel}</strong>
        </div>
      </section>
      {editing && (
        <section className="identity-editor" aria-label="Edit identity">
          <h2>Identity & aliases</h2>
          <div className="identity-grid">
            <label>
              Name
              <input
                value={draft.displayName ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, displayName: event.target.value })
                }
              />
            </label>
            <label>
              Primary handle
              <input
                value={draft.primaryHandle ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, primaryHandle: event.target.value })
                }
              />
            </label>
            <label>
              Email
              <input
                value={draft.email ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, email: event.target.value })
                }
              />
            </label>
            <label>
              Phone
              <input
                value={draft.phone ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, phone: event.target.value })
                }
              />
            </label>
          </div>
          <Button onClick={() => void save()}>Save identity</Button>
        </section>
      )}
      <section className="dossier-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Source threads</p>
            <h2>Conversations</h2>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              useAppStore
                .getState()
                .setSearchFilters({ personId: profile.person.id });
              navigateToSearch();
            }}
          >
            Search messages
          </Button>
        </div>
        {profile.threads.map((thread) => (
          <button
            key={thread.threadId}
            className="dossier-thread"
            onClick={() => {
              selectThread(thread.threadId);
              selectMessage(null);
              setView("conversations");
            }}
          >
            <span>
              <strong>{thread.title}</strong>
              <small>
                {thread.lastMessagePreview ||
                  thread.participantHandles.join(", ")}
              </small>
            </span>
            <time>{dateLabel(thread.lastMessageAt)}</time>
          </button>
        ))}
        {!profile.threads.length && (
          <p className="list-empty">
            No conversations are linked to this person.
          </p>
        )}
      </section>
      <details className="private-notes">
        <summary>Private notes · {profile.notes.length}</summary>
        <div>
          {profile.notes.map((note) => (
            <p key={note.id}>{note.content}</p>
          ))}
          {!profile.notes.length && <p>No private notes.</p>}
        </div>
      </details>
    </article>
  );
}

export function PeopleView() {
  const { selectedPersonId, selectPerson } = useAppStore();
  const [people, setPeople] = useState<Person[]>([]);
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "messages" | "az">("recent");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.openfolio.people
      .list({ limit: 100, query })
      .then((rows) => {
        setPeople(rows);
        if (!selectedPersonId && rows[0]) selectPerson(rows[0].id);
      })
      .finally(() => setLoading(false));
  }, [query, selectPerson, selectedPersonId]);
  useEffect(() => {
    if (!selectedPersonId) {
      setProfile(null);
      return;
    }
    window.openfolio.people.getProfile(selectedPersonId).then(setProfile);
  }, [selectedPersonId]);
  useEffect(() => {
    if (sort !== "messages") return;
    void Promise.all(
      people.map((person) => window.openfolio.people.getProfile(person.id)),
    ).then((profiles) =>
      setCounts(
        Object.fromEntries(
          profiles
            .filter(Boolean)
            .map((item) => [item!.person.id, item!.digest.messageCount]),
        ),
      ),
    );
  }, [people, sort]);

  const sorted = useMemo(
    () =>
      [...people].sort((left, right) =>
        sort === "az"
          ? left.displayName.localeCompare(right.displayName)
          : sort === "messages"
            ? (counts[right.id] ?? 0) - (counts[left.id] ?? 0)
            : right.updatedAt - left.updatedAt,
      ),
    [counts, people, sort],
  );

  return (
    <main className={`people-view ${selectedPersonId ? "has-selection" : ""}`}>
      <aside className="people-index">
        <header>
          <FolioMark number="02" label="PERSON INDEX" />
          <p className="eyebrow">Human index</p>
          <h1>People</h1>
          <label className="compact-search">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, alias, phone, or email"
              aria-label="Search people"
            />
          </label>
          <label className="sort-control">
            Sort
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
            >
              <option value="recent">Recent</option>
              <option value="messages">Most messages</option>
              <option value="az">A–Z</option>
            </select>
          </label>
        </header>
        <div className="people-list-archive">
          {loading &&
            Array.from({ length: 6 }).map((_, index) => (
              <Skeleton className="person-row-skeleton" key={index} />
            ))}
          {!loading &&
            sorted.map((person) => (
              <button
                key={person.id}
                className={`person-index-row ${person.id === selectedPersonId ? "selected" : ""}`}
                onClick={() => selectPerson(person.id)}
              >
                <ContactAvatar
                  name={
                    person.displayName ||
                    person.primaryHandle ||
                    "Unknown contact"
                  }
                  personId={person.id}
                />
                <span>
                  <strong>{person.displayName || "Unknown contact"}</strong>
                  <small>
                    {person.email ||
                      person.phone ||
                      person.primaryHandle ||
                      "Unknown contact"}
                  </small>
                </span>
                {sort === "messages" && counts[person.id] != null && (
                  <em>{counts[person.id].toLocaleString()}</em>
                )}
              </button>
            ))}
          {!loading && !sorted.length && (
            <p className="list-empty">No people matched.</p>
          )}
        </div>
      </aside>
      <section className="dossier-reader">
        {profile ? (
          <PersonDossier profile={profile} onBack={() => selectPerson(null)} />
        ) : (
          <div className="archive-empty">
            <MessageSquare />
            <h2>Select a person</h2>
            <p>People organize the records in your archive.</p>
          </div>
        )}
      </section>
    </main>
  );
}
