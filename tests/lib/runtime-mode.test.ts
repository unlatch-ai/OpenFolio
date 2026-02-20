import { afterEach, describe, expect, it } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("runtime mode hosted signup toggle", () => {
  it("defaults hosted deployments to invite-only signup", async () => {
    process.env.OPENFOLIO_MODE = "hosted";
    delete process.env.OPENFOLIO_HOSTED_SIGNUP_MODE;

    const { getRuntimeMode, isHostedInviteOnlySignup } = await import(
      "@/lib/runtime-mode"
    );

    expect(getRuntimeMode().hostedSignupMode).toBe("invite-only");
    expect(isHostedInviteOnlySignup()).toBe(true);
  });

  it("allows open hosted signup when configured", async () => {
    process.env.OPENFOLIO_MODE = "hosted";
    process.env.OPENFOLIO_HOSTED_SIGNUP_MODE = "open";

    const { getRuntimeMode, isHostedInviteOnlySignup } = await import(
      "@/lib/runtime-mode"
    );

    expect(getRuntimeMode().hostedSignupMode).toBe("open");
    expect(isHostedInviteOnlySignup()).toBe(false);
  });
});
