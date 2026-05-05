import { describe, expect, it } from "vitest";
import { withContactsAccessGuidance } from "../src/contacts-guidance";

describe("contacts access guidance", () => {
  it("adds Contacts privacy settings guidance once", () => {
    const guided = withContactsAccessGuidance({
      status: "denied",
      details: "Access Denied",
      canPrompt: false,
    });

    expect(guided.details).toContain("System Settings > Privacy & Security > Contacts");
    expect(withContactsAccessGuidance(guided).details).toBe(guided.details);
  });
});
