"use client";

import { useState } from "react";
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

import { getClientRuntimeMode } from "@/lib/runtime-mode";

const isSelfHosted = getClientRuntimeMode().deploymentMode === "self-hosted";
const hasGoogleOAuth = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        toast.error(error.message || "Failed to sign in");
        return;
      }

      // Claim any pending invites for this email
      try {
        const claimResponse = await fetch("/api/auth/claim-invites", {
          method: "POST",
        });
        const claimResult = await claimResponse.json();
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("of_claim_invites", "1");
        }
        if (claimResult.claimed > 0) {
          toast.success(
            `Welcome! You've joined ${claimResult.claimed} organization(s).`
          );
        } else {
          toast.success("Welcome back!");
        }
      } catch {
        // Silently fail - invites can be claimed later
        toast.success("Welcome back!");
      }

      const redirectTo = searchParams.get("redirectTo");
      router.push(redirectTo || "/app");
      router.refresh();
    } catch (error) {
      toast.error("An unexpected error occurred");
      console.error("Login error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-medium tracking-tight text-foreground">
          {isSelfHosted ? "Sign in" : "Welcome back"}
        </h1>
        <p className="text-muted-foreground">
          {isSelfHosted
            ? "Sign in to your OpenFolio instance"
            : "Sign in to continue to OpenFolio"}
        </p>
      </div>

      {(!isSelfHosted || hasGoogleOAuth) && (
        <div className="space-y-4">
          <GoogleOAuthButton
            type="signin"
            redirectTo={searchParams.get("redirectTo") || undefined}
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
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            disabled={isLoading}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium">
              Password
            </Label>
            <Link
              href="/forgot-password"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Forgot password?
            </Link>
          </div>
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
        </div>

        <Button
          type="submit"
          className="w-full h-11 font-medium"
          disabled={isLoading}
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          New to OpenFolio?{" "}
          <Link
            href="/signup"
            className="text-primary hover:underline font-medium"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
