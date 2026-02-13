import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/client";
import { MessageContent } from "@/app/app/(dashboard)/plan/components/MessageContent";
import { PlanSelectionProvider } from "@/app/app/(dashboard)/plan/components/PlanSelectionContext";
import { SelectionPanel } from "@/app/app/(dashboard)/plan/components/SelectionSidebar";

const personId = "6c789a82-b0e5-4a57-9b2b-9d6849788938";

describe("Plan citation selection", () => {
  beforeEach(() => {
    window.localStorage.clear();

    vi.mocked(createClient).mockReturnValue({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data:
                table === "people"
                  ? {
                      id: personId,
                      first_name: "Jane",
                      last_name: "Smith",
                      display_name: "Jane Smith",
                      email: "jane@example.com",
                      relationship_type: "colleague",
                      relationship_strength: null,
                      last_contacted_at: null,
                      location: "San Francisco, CA",
                      bio: "Person from citation click",
                      created_at: "2026-02-11T00:00:00.000Z",
                      updated_at: "2026-02-11T00:00:00.000Z",
                    }
                  : null,
            }),
          }),
        }),
      }),
    } as ReturnType<typeof createClient>);
  });

  it("shows selected citation details in the context panel", async () => {
    const user = userEvent.setup();

    render(
      <PlanSelectionProvider>
        <div>
          <MessageContent content={`Reach out to [Jane Smith](person:${personId}) about the project.`} />
          <SelectionPanel />
        </div>
      </PlanSelectionProvider>
    );

    expect(
      screen.getByText("Click a citation to preview details and keep it pinned while you chat.")
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /jane smith/i }));

    await waitFor(() => {
      expect(
        screen.queryByText("Click a citation to preview details and keep it pinned while you chat.")
      ).toBeNull();
    });

    await waitFor(() => {
      expect(screen.getByText("Email")).toBeTruthy();
      expect(screen.getByText("Person from citation click")).toBeTruthy();
    });
  });
});
