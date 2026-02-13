"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import ClaimInvitesOnAuth from "@/components/auth/ClaimInvitesOnAuth";

const isSelfHosted =
  process.env.NEXT_PUBLIC_OPENFOLIO_MODE === "self-hosted";

const onboardingSchema = z.object({
  organizationName: z.string().min(2, "Organization name must be at least 2 characters"),
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

export default function OnboardingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
  });

  // Check if user already has an organization
  useEffect(() => {
    const checkOrg = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: membership } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (membership) {
        // User already has an org, redirect to dashboard
        router.push("/app");
        return;
      }

      // Self-hosted mode: auto-create workspace
      if (isSelfHosted) {
        try {
          const response = await fetch("/api/onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ organizationName: "My CRM" }),
          });
          if (response.ok) {
            router.push("/app");
            router.refresh();
            return;
          }
        } catch {
          // Fall through to manual form
        }
      }

      setIsChecking(false);
    };

    checkOrg();
  }, [supabase, router]);

  const onSubmit = async (data: OnboardingFormData) => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "Failed to create organization");
        return;
      }

      toast.success("Organization created! Welcome to OpenFolio.");
      router.push("/app");
      router.refresh();
    } catch (error) {
      toast.error("An unexpected error occurred");
      console.error("Onboarding error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ClaimInvitesOnAuth />
      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-medium tracking-tight text-foreground">
          Welcome to OpenFolio
        </h1>
        <p className="text-muted-foreground">
          Let&apos;s set up your organization to get started
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create your organization</CardTitle>
          <CardDescription>
            This is where your contacts, companies, and data will live
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organizationName" className="text-sm font-medium">
                Organization name
              </Label>
              <Input
                id="organizationName"
                type="text"
                placeholder="e.g., CMU Tech & Entrepreneurship"
                className="h-11"
                {...register("organizationName")}
                disabled={isLoading}
              />
              {errors.organizationName && (
                <p className="text-sm text-destructive">{errors.organizationName.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                This is usually your community, company, or group name
              </p>
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating organization...
                </>
              ) : (
                "Create organization"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
