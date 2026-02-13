"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Building2, Users } from "lucide-react";

export interface CompanyCardData {
  id: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
  location?: string | null;
  logo_url?: string | null;
  description?: string | null;
  person_companies?: Array<{ person_id: string }>;
}

export function CompanyCard({ company }: { company: CompanyCardData }) {
  const initial = company.name?.[0]?.toUpperCase() || "?";
  const peopleCount = company.person_companies?.length ?? 0;

  return (
    <Link href={`/app/companies/${company.id}`}>
      <Card className="hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer h-full">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Avatar>
              {company.logo_url ? (
                <AvatarImage src={company.logo_url} alt={company.name} />
              ) : null}
              <AvatarFallback>
                {initial !== "?" ? (
                  initial
                ) : (
                  <Building2 className="h-4 w-4" />
                )}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">
                {company.name}
              </p>
              {company.industry && (
                <p className="text-sm text-muted-foreground truncate">
                  {company.industry}
                </p>
              )}
              {!company.industry && company.domain && (
                <p className="text-sm text-muted-foreground truncate">
                  {company.domain}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                {company.location && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {company.location}
                  </Badge>
                )}
                {peopleCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {peopleCount}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
