import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

const waitlistSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { key: "waitlist", limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = waitlistSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from("waitlist_entries")
      .select("id, name, email, status, invited_at, created_at")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ entry: existing, created: false });
    }

    const { data: entry, error } = await supabase
      .from("waitlist_entries")
      .insert({
        name,
        email: normalizedEmail,
      })
      .select("id, name, email, status, invited_at, created_at")
      .single();

    if (error) {
      console.error("Error creating waitlist entry:", error);
      return NextResponse.json(
        { error: "Failed to join waitlist" },
        { status: 500 }
      );
    }

    return NextResponse.json({ entry, created: true }, { status: 201 });
  } catch (error) {
    console.error("Error in waitlist API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
