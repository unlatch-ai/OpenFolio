"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Globe,
  MapPin,
  Loader2,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PersonCard, type PersonCardData } from "@/components/person-card";
import { TimelineView } from "@/components/timeline-view";
import { TagManager } from "@/components/tag-manager";
import { apiFetch } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";

interface CompanyDetail {
  id: string;
  name: string;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  location?: string | null;
  description?: string | null;
  logo_url?: string | null;
  person_companies?: Array<{
    role?: string | null;
    people: PersonCardData;
  }>;
  company_tags?: Array<{
    tags: { id: string; name: string; color: string | null };
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

export default function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (workspaceLoading || !currentWorkspace) return;

    const fetchCompany = async () => {
      setIsLoading(true);
      try {
        const res = await apiFetch(`/api/companies/${id}`);
        if (res.ok) {
          const json = await res.json();
          setCompany(json.data);
        } else {
          setCompany(null);
        }
      } catch {
        setCompany(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCompany();
  }, [id, workspaceLoading, currentWorkspace]);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this company?")) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/companies/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/app/companies");
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

  if (!company) {
    return (
      <div className="max-w-5xl mx-auto text-center py-24">
        <p className="text-muted-foreground">Company not found</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/app/companies">Back to Companies</Link>
        </Button>
      </div>
    );
  }

  const tags = company.company_tags?.map((ct) => ct.tags) || [];
  const people = company.person_companies?.map((pc) => ({
    ...pc.people,
    person_companies: [{ companies: { id: company.id, name: company.name }, role: pc.role ?? undefined }],
  })) || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/app/companies">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Companies
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — People + Interactions */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                People ({people.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {people.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {people.map((person) => (
                    <PersonCard key={person.id} person={person} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No people associated yet
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Interactions</CardTitle>
            </CardHeader>
            <CardContent>
              <TimelineView
                interactions={company.recent_interactions || []}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right column — Company info */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <Avatar size="lg" className="h-16 w-16 mb-3">
                  {company.logo_url && (
                    <AvatarImage src={company.logo_url} alt={company.name} />
                  )}
                  <AvatarFallback className="text-lg">
                    {company.name?.[0]?.toUpperCase() || (
                      <Building2 className="h-6 w-6" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <h2 className="text-xl font-semibold">{company.name}</h2>
                {company.industry && (
                  <Badge variant="secondary" className="mt-1">
                    {company.industry}
                  </Badge>
                )}
                {company.description && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {company.description}
                  </p>
                )}
              </div>

              <Separator className="my-4" />

              <div className="space-y-3 text-sm">
                {company.domain && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="h-4 w-4 shrink-0" />
                    <span>{company.domain}</span>
                  </div>
                )}
                {company.website && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="truncate hover:text-foreground"
                    >
                      {company.website}
                    </a>
                  </div>
                )}
                {company.location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{company.location}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <TagManager
                entityType="company"
                entityId={company.id}
                initialTags={tags}
              />
            </CardContent>
          </Card>

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
            Delete Company
          </Button>
        </div>
      </div>
    </div>
  );
}
