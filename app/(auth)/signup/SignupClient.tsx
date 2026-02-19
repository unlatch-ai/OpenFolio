"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import GoogleOAuthButton from "@/components/auth/GoogleOAuthButton";

const signupSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  organizationName: z.string().min(2, "Organization name must be at least 2 characters").optional(),
});

type SignupFormData = z.infer<typeof signupSchema>;

type InviteInfo = {
  type: "app" | "workspace";
  email?: string;
  workspace?: { id: string; name: string };
  role?: "owner" | "member";
  inviterName?: string | null;
};

const hasGoogleOAuth = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

export default function SignupClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("token");
  const [isLoading, setIsLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const supabase = createClient();

  const oauthRedirectTo = inviteToken
    ? `/invite?token=${encodeURIComponent(inviteToken)}`
    : "/app";

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  useEffect(() => {
    if (!inviteToken) return;
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/auth/invite/preview?token=${encodeURIComponent(inviteToken)}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Invalid invite");
        }
        const data = await response.json();
        if (active) {
          setInviteInfo(data);
          if (data?.email) {
            setValue("email", data.email);
          }
        }
      } catch (error) {
        if (active) setInviteError(error instanceof Error ? error.message : "Invalid invite");
      }
    })();
    return () => {
      active = false;
    };
  }, [inviteToken, setValue]);

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          inviteToken,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "Failed to create account");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (signInError) {
        toast.success("Account created! Please log in.");
        router.push("/login");
        return;
      }

      toast.success("Welcome to OpenFolio!");
      router.push("/app");
      router.refresh();
    } catch (error) {
      toast.error("An unexpected error occurred");
      console.error("Signup error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (inviteError) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-serif font-medium tracking-tight text-foreground">
            Invite link invalid
          </h1>
          <p className="text-muted-foreground">
            {inviteError}. If you believe this is a mistake, contact
            {" "}
            <span className="font-medium text-foreground">me@kevinfang.tech</span>.
          </p>
        </div>
        <Button
          className="w-full h-11 font-medium"
          onClick={() => router.push("/login")}
        >
          Log in
        </Button>
      </div>
    );
  }

  if (inviteToken && !inviteInfo) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-serif font-medium tracking-tight text-foreground">
            Checking invite...
          </h1>
          <p className="text-muted-foreground">
            Please wait while we validate your invite.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-medium tracking-tight text-foreground">
          Create your account
        </h1>
        <p className="text-muted-foreground">
          {inviteInfo?.type === "workspace"
            ? `Join ${inviteInfo.workspace?.name || "a workspace"} on OpenFolio`
            : "Start managing your network today"}
        </p>
      </div>

      {hasGoogleOAuth ? (
        <div className="space-y-4">
          <GoogleOAuthButton
            type="signup"
            redirectTo={oauthRedirectTo}
          />
          <p className="text-xs text-muted-foreground">
            By continuing with Google, you agree that we will receive your name, email
            address, profile photo, and Google ID to create and secure your account. We
            do not access other Google data. Learn more in our{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-sm font-medium">
              Your name
            </Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Jane Smith"
              className="h-11"
              {...register("fullName")}
              disabled={isLoading}
            />
            {errors.fullName && (
              <p className="text-sm text-destructive">{errors.fullName.message}</p>
            )}
          </div>

          {inviteInfo?.type === "app" && (
            <div className="space-y-2">
              <Label htmlFor="organizationName" className="text-sm font-medium">
                Organization
              </Label>
              <Input
                id="organizationName"
                type="text"
                placeholder="Startup Community"
                className="h-11"
                {...register("organizationName")}
                disabled={isLoading}
              />
              {errors.organizationName && (
                <p className="text-sm text-destructive">{errors.organizationName.message}</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email address
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            className="h-11"
            {...register("email")}
            disabled={isLoading || Boolean(inviteInfo?.email)}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            className="h-11"
            {...register("password")}
            disabled={isLoading}
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Must be at least 6 characters
          </p>
        </div>

        <Button
          type="submit"
          className="w-full h-11 font-medium"
          disabled={isLoading}
        >
          {isLoading ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-primary hover:underline font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
