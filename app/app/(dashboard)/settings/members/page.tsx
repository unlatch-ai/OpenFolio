"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson, apiFetch } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Member = {
  id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

type Invite = {
  id: string;
  email: string;
  role: "owner" | "member";
  created_at: string;
  expires_at?: string;
  accepted_at?: string | null;
  last_sent_at?: string | null;
};

export default function SettingsMembersPage() {
  const { workspaceRole } = useWorkspace();
  const isOwner = workspaceRole === "owner";

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "member">("member");

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [membersData, invitesData] = await Promise.all([
        apiJson<{ members: Member[] }>("/api/workspace/members"),
        apiJson<{ invites: Invite[] }>("/api/workspace/invites"),
      ]);

      setMembers(membersData.members || []);
      setInvites(invitesData.invites || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load members");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const pendingInvites = useMemo(() => {
    const now = Date.now();
    return invites.filter((invite) => {
      if (invite.accepted_at) return false;
      if (!invite.expires_at) return true;
      return new Date(invite.expires_at).getTime() > now;
    });
  }, [invites]);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    try {
      const response = await apiFetch("/api/workspace/invites", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to send invite");
      }
      setInviteEmail("");
      await loadData();
      toast.success("Invite sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send invite");
    }
  };

  const handleRoleChange = async (userId: string, role: "owner" | "member") => {
    try {
      const response = await apiFetch(`/api/workspace/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update role");
      }
      await loadData();
      toast.success("Role updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update role");
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      const response = await apiFetch(`/api/workspace/members/${userId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove member");
      }
      await loadData();
      toast.success("Member removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove member");
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      const response = await apiFetch(`/api/workspace/invites/${inviteId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to cancel invite");
      }
      await loadData();
      toast.success("Invite canceled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel invite");
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      const response = await apiFetch(`/api/workspace/invites/${inviteId}`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to resend invite");
      }
      await loadData();
      toast.success("Invite resent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resend invite");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-serif font-medium tracking-tight text-foreground">
          Members & Invites
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage workspace access and roles
        </p>
      </header>

      <Tabs defaultValue="members" className="space-y-6">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Workspace members</CardTitle>
              <CardDescription>People who currently have access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <p className="text-muted-foreground">Loading members…</p>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-foreground">
                          {member.profiles?.full_name || "User"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {member.profiles?.email || member.user_id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                          {member.role}
                        </Badge>
                        {isOwner && (
                          <>
                            <Select
                              value={member.role}
                              onValueChange={(value) => handleRoleChange(member.user_id, value as "owner" | "member")}
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="owner">Owner</SelectItem>
                                <SelectItem value="member">Member</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              onClick={() => handleRemove(member.user_id)}
                            >
                              Remove
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && (
                    <p className="text-sm text-muted-foreground">No members found.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invites" className="space-y-4">
          {isOwner && (
            <Card>
              <CardHeader>
                <CardTitle>Invite someone</CardTitle>
                <CardDescription>Send an invite link by email</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[1fr_160px_120px]">
                  <div className="space-y-2">
                    <Label htmlFor="inviteEmail">Email</Label>
                    <Input
                      id="inviteEmail"
                      type="email"
                      placeholder="teammate@example.com"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as "owner" | "member")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full" onClick={handleInvite}>
                      Send invite
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Pending invites</CardTitle>
              <CardDescription>Active invites that have not been accepted yet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <p className="text-muted-foreground">Loading invites…</p>
              ) : (
                <div className="space-y-3">
                  {pendingInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-foreground">{invite.email}</p>
                        <p className="text-sm text-muted-foreground">
                          Expires {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : "soon"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={invite.role === "owner" ? "default" : "secondary"}>
                          {invite.role}
                        </Badge>
                        {isOwner && (
                          <>
                            <Button variant="ghost" onClick={() => handleResendInvite(invite.id)}>
                              Resend
                            </Button>
                            <Button variant="ghost" onClick={() => handleCancelInvite(invite.id)}>
                              Cancel
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {pendingInvites.length === 0 && (
                    <p className="text-sm text-muted-foreground">No pending invites.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
