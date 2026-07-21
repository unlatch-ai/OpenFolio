import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Edit3, MessageSquare, Search, X } from "lucide-react";
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
          <div className="dossier-identity-copy">
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
            {editing ? (
              <X data-icon="inline-start" />
            ) : (
              <Edit3 data-icon="inline-start" />
            )}
            {editing ? "Close editor" : "Edit identity"}
          </Button>
        </div>
        <MessageStrata profile={profile} />
        <p className="dossier-summary">
          {profile.digest.messageCount.toLocaleString()} messages ·{" "}
          {dateLabel(profile.summary.firstContactAt)}–
          {dateLabel(profile.summary.lastContactAt)}
        </p>
      </header>
      <section className="dossier-facts" aria-label="Message activity">
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
          <h2>Identity</h2>
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
            <label>
              Company
              <input
                value={draft.companyName ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, companyName: event.target.value })
                }
              />
            </label>
            <label>
              Role
              <input
                value={draft.jobTitle ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, jobTitle: event.target.value })
                }
              />
            </label>
            <label className="identity-field-wide">
              Location
              <input
                value={draft.location ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, location: event.target.value })
                }
              />
            </label>
          </div>
          <div className="identity-actions">
            <Button onClick={() => void save()}>Save changes</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </section>
      )}
      <section className="dossier-section">
        <div className="section-heading">
          <div>
            <h2>Conversations</h2>
            <p className="section-description">Original threads with this person</p>
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
  const [profileLoading, setProfileLoading] = useState(false);
  const [listError, setListError] = useState(false);
  const [loadRequest, setLoadRequest] = useState(0);

  useEffect(() => {
    setLoading(true);
    setListError(false);
    window.openfolio.people
      .list({ limit: 100, query })
      .then((rows) => {
        setPeople(rows);
        if (
          !useAppStore.getState().selectedPersonId &&
          rows[0] &&
          window.matchMedia("(min-width: 1040px)").matches
        ) {
          selectPerson(rows[0].id);
        }
      })
      .catch(() => {
        setPeople([]);
        setListError(true);
      })
      .finally(() => setLoading(false));
  }, [loadRequest, query, selectPerson]);
  useEffect(() => {
    if (!selectedPersonId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    let active = true;
    setProfileLoading(true);
    window.openfolio.people
      .getProfile(selectedPersonId)
      .then((nextProfile) => {
        if (active) setProfile(nextProfile);
      })
      .catch(() => {
        if (active) setProfile(null);
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
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
          <h1>People</h1>
          <p className="index-summary">{people.length.toLocaleString()} people from Messages</p>
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
          {!loading && listError && (
            <div className="list-empty">
              <strong>People could not load</strong>
              <span>Your message library is unchanged.</span>
              <Button size="sm" variant="secondary" onClick={() => setLoadRequest((value) => value + 1)}>
                Try again
              </Button>
            </div>
          )}
          {!loading && !listError && !sorted.length && (
            <div className="list-empty">
              <strong>{query ? "No matching people" : "No people yet"}</strong>
              <span>{query ? "Try another name, email, or phone number." : "Import Messages from Settings to build this list."}</span>
            </div>
          )}
        </div>
      </aside>
      <section className="dossier-reader">
        {profileLoading ? (
          <div className="profile-loading" aria-label="Loading person">
            <Skeleton className="profile-heading-skeleton" />
            <Skeleton className="profile-body-skeleton" />
          </div>
        ) : profile ? (
          <PersonDossier profile={profile} onBack={() => selectPerson(null)} />
        ) : (
          <div className="archive-empty">
            <MessageSquare />
            <h2>Select a person</h2>
            <p>Select someone to see your message history with them.</p>
          </div>
        )}
      </section>
    </main>
  );
}
