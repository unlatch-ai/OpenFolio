"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building2,
  Globe,
  Loader2,
  Trash2,
  Send,
  GitMerge,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { TimelineView } from "@/components/timeline-view";
import { TagManager } from "@/components/tag-manager";
import { apiFetch } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";

interface PersonDetail {
  id: string;
  first_name: string;
  last_name?: string | null;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  location?: string | null;
  relationship_type?: string | null;
  relationship_strength?: number | null;
  last_contacted_at?: string | null;
  next_followup_at?: string | null;
  social_profiles?: Array<{
    id: string;
    platform: string;
    profile_url?: string | null;
    username?: string | null;
  }>;
  person_companies?: Array<{
    role?: string | null;
    companies: { id: string; name: string; domain?: string | null };
  }>;
  person_tags?: Array<{
    tags: { id: string; name: string; color: string | null };
  }>;
  notes?: Array<{
    id: string;
    content: string;
    created_at: string;
  }>;
  recent_interactions?: Array<{
    id: string;
    interaction_type: string;
    subject?: string | null;
    notes?: string | null;
    direction?: string | null;
    occurred_at: string;
    duration_minutes?: number | null;
  }>;
}

function getInitials(firstName: string, lastName?: string | null): string {
  return ((firstName?.[0] || "") + (lastName?.[0] || "")).toUpperCase() || "?";
}

const SOCIAL_ICONS: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "Twitter",
  github: "GitHub",
  facebook: "Facebook",
  instagram: "Instagram",
};

function MergeSearchResults({
  query,
  excludeId,
  onSelect,
}: {
  query: string;
  excludeId: string;
  onSelect: (id: string) => void;
}) {
  const [results, setResults] = useState<
    Array<{ id: string; first_name: string; last_name: string | null; email: string | null }>
  >([]);
  const { currentWorkspace } = useWorkspace();

  useEffect(() => {
    if (query.length < 2 || !currentWorkspace) return;
    let active = true;
    const search = async () => {
      try {
        const res = await apiFetch(`/api/people?search=${encodeURIComponent(query)}&limit=5`);
        if (res.ok && active) {
          const json = await res.json();
          setResults(
            (json.data || []).filter(
              (p: { id: string }) => p.id !== excludeId
            )
          );
        }
      } catch {
        // ignore
      }
    };
    const timer = setTimeout(search, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, excludeId, currentWorkspace]);

  if (results.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-2">
        No matches found
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {results.map((p) => (
        <button
          key={p.id}
          className="w-full text-left rounded-md p-2 text-sm hover:bg-muted flex items-center gap-2"
          onClick={() => onSelect(p.id)}
        >
          <span className="font-medium">
            {p.first_name} {p.last_name || ""}
          </span>
          {p.email && (
            <span className="text-muted-foreground text-xs truncate">
              {p.email}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [noteContent, setNoteContent] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  useEffect(() => {
    if (workspaceLoading || !currentWorkspace) return;

    const fetchPerson = async () => {
      setIsLoading(true);
      try {
        const res = await apiFetch(`/api/people/${id}`);
        if (res.ok) {
          const json = await res.json();
          setPerson(json.data);
        } else {
          setPerson(null);
        }
      } catch {
        setPerson(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPerson();
  }, [id, workspaceLoading, currentWorkspace]);

  const addNote = async () => {
    if (!noteContent.trim() || addingNote) return;
    setAddingNote(true);
    try {
      const res = await apiFetch(`/api/people/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: noteContent.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        setPerson((prev) =>
          prev
            ? {
                ...prev,
                notes: [json.data, ...(prev.notes || [])],
              }
            : prev
        );
        setNoteContent("");
      }
    } finally {
      setAddingNote(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this person?")) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/people/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/app/people");
      }
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="max-w-5xl mx-auto text-center py-24">
        <p className="text-muted-foreground">Person not found</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/app/people">Back to People</Link>
        </Button>
      </div>
    );
  }

  const displayName =
    person.display_name ||
    `${person.first_name} ${person.last_name || ""}`.trim();

  const tags =
    person.person_tags?.map((pt) => pt.tags) || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/app/people">
            <ArrowLeft className="h-4 w-4 mr-1" />
            People
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — Timeline + Notes */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Interactions</CardTitle>
            </CardHeader>
            <CardContent>
              <TimelineView
                interactions={person.recent_interactions || []}
                showParticipants={false}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add a note..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="min-h-[60px]"
                />
                <Button
                  size="sm"
                  onClick={addNote}
                  disabled={!noteContent.trim() || addingNote}
                  className="shrink-0 self-end"
                >
                  {addingNote ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {person.notes && person.notes.length > 0 ? (
                <div className="space-y-3">
                  {person.notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-md border p-3 text-sm"
                    >
                      <p className="whitespace-pre-wrap">{note.content}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(note.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No notes yet
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — Profile */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <Avatar size="lg" className="h-16 w-16 mb-3">
                  {person.avatar_url && (
                    <AvatarImage src={person.avatar_url} alt={displayName} />
                  )}
                  <AvatarFallback className="text-lg">
                    {getInitials(person.first_name, person.last_name)}
                  </AvatarFallback>
                </Avatar>
                <h2 className="text-xl font-semibold">{displayName}</h2>
                {person.relationship_type && (
                  <Badge variant="secondary" className="mt-1 capitalize">
                    {person.relationship_type}
                  </Badge>
                )}
                {person.bio && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {person.bio}
                  </p>
                )}
              </div>

              <Separator className="my-4" />

              <div className="space-y-3 text-sm">
                {person.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" />
                    <a
                      href={`mailto:${person.email}`}
                      className="truncate hover:text-foreground"
                    >
                      {person.email}
                    </a>
                  </div>
                )}
                {person.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span>{person.phone}</span>
                  </div>
                )}
                {person.location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{person.location}</span>
                  </div>
                )}
              </div>

              {person.social_profiles && person.social_profiles.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    {person.social_profiles.map((sp) => (
                      <div
                        key={sp.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                        {sp.profile_url ? (
                          <a
                            href={sp.profile_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-muted-foreground hover:text-foreground truncate"
                          >
                            {SOCIAL_ICONS[sp.platform] || sp.platform}
                            {sp.username ? ` — ${sp.username}` : ""}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">
                            {SOCIAL_ICONS[sp.platform] || sp.platform}
                            {sp.username ? ` — ${sp.username}` : ""}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {person.person_companies && person.person_companies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Companies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {person.person_companies.map((pc) => (
                  <Link
                    key={pc.companies.id}
                    href={`/app/companies/${pc.companies.id}`}
                    className="flex items-center gap-2 text-sm p-2 rounded-md hover:bg-muted"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {pc.companies.name}
                      </p>
                      {pc.role && (
                        <p className="text-xs text-muted-foreground">
                          {pc.role}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <TagManager
                entityType="person"
                entityId={person.id}
                initialTags={tags}
              />
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowMergeDialog(!showMergeDialog)}
              disabled={merging}
            >
              <GitMerge className="h-4 w-4 mr-2" />
              Merge with Another Contact
            </Button>

            {showMergeDialog && (
              <Card>
                <CardContent className="p-3 space-y-2">
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={mergeSearch}
                    onChange={(e) => setMergeSearch(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                  {mergeSearch.length >= 2 && (
                    <MergeSearchResults
                      query={mergeSearch}
                      excludeId={id}
                      onSelect={async (mergeId) => {
                        if (
                          !confirm(
                            "Are you sure you want to merge this person into the current contact? This cannot be undone."
                          )
                        )
                          return;
                        setMerging(true);
                        try {
                          const res = await apiFetch("/api/people/merge", {
                            method: "POST",
                            body: JSON.stringify({
                              keep_id: id,
                              merge_id: mergeId,
                            }),
                          });
                          if (res.ok) {
                            setShowMergeDialog(false);
                            setMergeSearch("");
                            // Re-fetch person data
                            const updated = await apiFetch(`/api/people/${id}`);
                            if (updated.ok) {
                              const json = await updated.json();
                              setPerson(json.data);
                            }
                          } else {
                            const data = await res.json();
                            alert(data.error || "Merge failed");
                          }
                        } finally {
                          setMerging(false);
                        }
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete Person
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
