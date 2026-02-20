// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  dotenv.config({ path: envPath });
}

function buildZeroVector(length: number) {
  return `[${Array.from({ length }, () => "0").join(",")}]`;
}

async function isSupabaseReachable(url: string, key: string) {
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
      },
    });
    return res.status !== 0;
  } catch {
    return false;
  }
}

describe("Supabase RPC vector search", () => {
  it("executes current vector match RPCs without errors", async () => {
    loadEnv();

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return;
    }

    const reachable = await isSupabaseReachable(supabaseUrl, serviceKey);
    if (!reachable) {
      return;
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const zeroVector = buildZeroVector(1536);
    const { error: peopleErr } = await supabase.rpc("match_people_text", {
      query_embedding: zeroVector,
      match_threshold: 0.0,
      match_count: 1,
      p_workspace_id: "00000000-0000-0000-0000-000000000000",
    });

    expect(peopleErr).toBeNull();

    const { error: interactionsErr } = await supabase.rpc(
      "match_interactions_text",
      {
        query_embedding: zeroVector,
        match_threshold: 0.0,
        match_count: 1,
        p_workspace_id: "00000000-0000-0000-0000-000000000000",
      }
    );

    expect(interactionsErr).toBeNull();
  });
});
