"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

function getOrigin() {
  if (typeof window === "undefined") return "";
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL;
  const origin = envOrigin && envOrigin.length > 0 ? envOrigin : window.location.origin;
  return origin.replace(/\/$/, "");
}

interface GoogleOAuthButtonProps {
  type?: "signin" | "signup";
  redirectTo?: string;
  showDivider?: boolean;
}

export default function GoogleOAuthButton({
  type = "signin",
  redirectTo,
  showDivider = true,
}: GoogleOAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const supabase = createClient();
      const origin = getOrigin();
      const callbackUrl = `${origin}/auth/callback`;
      const finalRedirect = redirectTo
        ? `${callbackUrl}?redirectTo=${encodeURIComponent(redirectTo)}`
        : callbackUrl;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: finalRedirect,
        },
      });

      if (error) {
        console.error("Google OAuth error:", error);
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Google OAuth error:", err);
      setIsLoading(false);
    }
  };

  const imageSrc = `/google-btn/${type}-light.svg`;
  const altText = type === "signin" ? "Sign in with Google" : "Sign up with Google";

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="block mx-auto focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-[20px] disabled:opacity-70 disabled:cursor-not-allowed transition-opacity"
      >
        <Image
          src={imageSrc}
          alt={altText}
          width={175}
          height={40}
          className="h-10 w-auto"
          priority
        />
      </button>

      {showDivider ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      ) : null}
    </div>
  );
}
