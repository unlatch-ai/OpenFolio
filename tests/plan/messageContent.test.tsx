import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageContent } from "@/app/app/(dashboard)/plan/components/MessageContent";

describe("MessageContent citations", () => {
  it("renders internal citation links as citation cards", () => {
    const id = "uuid-test-123";

    render(<MessageContent content={`Use [Jane Smith](person:${id}) for reference.`} />);

    expect(screen.queryByRole("link", { name: "Jane Smith" })).toBeNull();
    const openLink = screen.getByLabelText("Open Jane Smith in a new tab");
    expect(openLink.getAttribute("href")).toBe(`/app/people/${id}`);
  });

  it("keeps default URL sanitization for non-citation links", () => {
    render(<MessageContent content="[Bad Link](javascript:alert(1))" />);

    const link = screen.getByText("Bad Link").closest("a");
    expect(link).not.toBeNull();
    if (!link) {
      throw new Error("Expected markdown link element to be rendered");
    }
    expect(link.getAttribute("href")).toBe("");
  });
});
