import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendAppInviteEmail, sendWorkspaceInviteEmail } from "@/lib/email";

describe("lib/email", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM = "OpenFolio <hello@example.com>";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("throws when RESEND_API_KEY or RESEND_FROM is missing", async () => {
    delete process.env.RESEND_API_KEY;

    await expect(
      sendWorkspaceInviteEmail({
        to: "test@example.com",
        workspaceName: "Test Workspace",
        role: "member",
        inviteLink: "http://localhost:3000/invite?token=abc",
      })
    ).rejects.toThrow("Missing RESEND_API_KEY or RESEND_FROM");
  });

  it("sends workspace invite email", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({ ok: true } as Response);

    await sendWorkspaceInviteEmail({
      to: "test@example.com",
      workspaceName: "Test Workspace",
      role: "member",
      inviteLink: "http://localhost:3000/invite?token=abc",
      inviterName: "Alex",
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer test-key",
      }),
    }));
  });

  it("sends app invite email", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({ ok: true } as Response);

    await sendAppInviteEmail({
      to: "test@example.com",
      inviteLink: "http://localhost:3000/signup?token=abc",
      inviterName: "Alex",
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer test-key",
      }),
    }));
  });

  it("throws with response body on failure", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    } as Response);

    await expect(
      sendAppInviteEmail({
        to: "test@example.com",
        inviteLink: "http://localhost:3000/signup?token=abc",
      })
    ).rejects.toThrow("Resend error: 400 Bad Request");
  });
});
