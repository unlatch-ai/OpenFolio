"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Plug } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import type { Workspace } from "@/types";

export default function SettingsPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [customInstructions, setCustomInstructions] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Fetch workspace data
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);

      // Fetch workspace
      const response = await apiFetch("/api/workspace");
      if (response.ok) {
        const data = await response.json();
        const nextWorkspace = data.workspace ?? data.organization ?? null;
        setWorkspace(nextWorkspace);
        const settings = nextWorkspace?.settings;
        if (settings && typeof settings === "object" && !Array.isArray(settings)) {
          const instructions = (settings as Record<string, unknown>).custom_instructions;
          setCustomInstructions(typeof instructions === "string" ? instructions : "");
        } else {
          setCustomInstructions("");
        }
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCustomInstructions = async () => {
    try {
      setSaveStatus("saving");
      const response = await apiFetch("/api/workspace", {
        method: "PATCH",
        body: JSON.stringify({ custom_instructions: customInstructions }),
      });

      if (!response.ok) {
        setSaveStatus("error");
        return;
      }

      const data = await response.json();
      const nextWorkspace = data.workspace ?? data.organization ?? null;
      setWorkspace(nextWorkspace);
      const settings = nextWorkspace?.settings;
      if (settings && typeof settings === "object" && !Array.isArray(settings)) {
        const instructions = (settings as Record<string, unknown>).custom_instructions;
        setCustomInstructions(typeof instructions === "string" ? instructions : "");
      }
      setSaveStatus("saved");
    } catch (error) {
      console.error("Failed to save instructions:", error);
      setSaveStatus("error");
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-serif font-medium tracking-tight text-foreground">
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your workspace
        </p>
      </header>

      {/* Workspace Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-secondary flex items-center justify-center">
              <Plug className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">Integrations</CardTitle>
              <CardDescription>Connect Google and Microsoft data sources</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/app/settings/integrations">Manage integrations</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/api/integrations/google/connect">Connect Google</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/api/integrations/microsoft/connect">Connect Microsoft</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-secondary flex items-center justify-center">
              <Building2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">Workspace</CardTitle>
              <CardDescription>Your workspace information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {workspace ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Name</Label>
                <p className="font-medium text-foreground">{workspace.name}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Slug</Label>
                <p className="font-medium text-foreground">{workspace.slug}</p>
              </div>
              {workspace.website && (
                <div className="col-span-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Website</Label>
                  <p className="font-medium text-foreground">{workspace.website}</p>
                </div>
              )}
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Created</Label>
                <p className="text-sm text-foreground">
                  {new Date(workspace.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No workspace found</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-secondary flex items-center justify-center">
              <Building2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">Custom instructions</CardTitle>
              <CardDescription>
                Context to append to the planning agent prompt for this workspace.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="custom-instructions" className="text-muted-foreground text-xs uppercase tracking-wide">
              Instructions
            </Label>
            <Textarea
              id="custom-instructions"
              value={customInstructions}
              onChange={(event) => {
                setCustomInstructions(event.target.value);
                if (saveStatus !== "idle") {
                  setSaveStatus("idle");
                }
              }}
              placeholder="Add background info, tone preferences, or constraints for this organization."
              rows={6}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={saveCustomInstructions} disabled={saveStatus === "saving"}>
              {saveStatus === "saving" ? "Saving..." : "Save instructions"}
            </Button>
            {saveStatus === "saved" && (
              <span className="text-sm text-muted-foreground">Saved</span>
            )}
            {saveStatus === "error" && (
              <span className="text-sm text-destructive">Failed to save</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-secondary flex items-center justify-center">
              <Building2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">Members & Invites</CardTitle>
              <CardDescription>Manage workspace access</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/app/settings/members">Manage members</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
