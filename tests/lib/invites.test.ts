import { describe, it, expect } from "vitest";
import { hashInviteToken, getInviteExpiry, isInviteExpired } from "@/lib/invites";

describe("invite utils", () => {
  it("hashInviteToken is deterministic", () => {
    const token = "abc123";
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
  });

  it("getInviteExpiry returns future ISO string", () => {
    const expiry = getInviteExpiry(1);
    expect(new Date(expiry).getTime()).toBeGreaterThan(Date.now());
  });

  it("isInviteExpired returns true for past", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isInviteExpired(past)).toBe(true);
  });
});
