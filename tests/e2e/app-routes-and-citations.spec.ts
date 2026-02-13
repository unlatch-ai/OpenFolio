import { test, expect, type Page, type Route } from "@playwright/test";

const workspaceId = "11111111-1111-1111-1111-111111111111";
const chatId = "b737d732-90fc-4e5e-bf47-0497cde1a7e7";
const personId = "6c789a82-b0e5-4a57-9b2b-9d6849788938";

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "*",
    "content-type": "application/json",
  };
}

async function fulfillSupabasePerson(route: Route) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: corsHeaders(),
      body: "",
    });
    return;
  }

  await route.fulfill({
    status: 200,
    headers: corsHeaders(),
    body: JSON.stringify({
      id: personId,
      first_name: "Jane",
      last_name: "Smith",
      display_name: "Jane Smith",
      email: "jane@example.com",
      relationship_type: "colleague",
      relationship_strength: null,
      last_contacted_at: null,
      location: "San Francisco, CA",
      bio: "Person from Playwright mock",
      created_at: "2026-02-11T00:00:00.000Z",
      updated_at: "2026-02-11T00:00:00.000Z",
    }),
  });
}

async function installCommonAppMocks(page: Page) {
  await page.route("**/api/auth/claim-invites", async (route) => {
    await route.fulfill(jsonResponse({ ok: true }));
  });

  await page.route("**/api/user/workspaces", async (route) => {
    await route.fulfill(
      jsonResponse({
        workspaces: [
          {
            id: workspaceId,
            name: "Test Workspace",
            slug: "test-workspace",
            settings: null,
            created_at: "2026-02-11T00:00:00.000Z",
            role: "owner",
          },
        ],
      })
    );
  });
}

test("plan citation click previews details in Context panel", async ({ page }) => {
  await installCommonAppMocks(page);

  await page.route("**/api/chats", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill(
      jsonResponse({
        chats: [
          {
            id: chatId,
            title: "Mock chat",
            created_by: "test-user",
            created_at: "2026-02-11T00:00:00.000Z",
            updated_at: "2026-02-11T00:00:00.000Z",
            message_count: 1,
            last_message_at: "2026-02-11T00:00:00.000Z",
          },
        ],
      })
    );
  });

  await page.route("**/api/chats/*/messages", async (route) => {
    await route.fulfill(
      jsonResponse({
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            content: `Reach out to [Jane Smith](person:${personId}) about the project.`,
            citations: null,
            tool_calls: null,
          },
        ],
        chat_updated_at: "2026-02-11T00:00:00.000Z",
      })
    );
  });

  await page.route("**/rest/v1/people*", fulfillSupabasePerson);

  await page.goto(`/app/plan?chat=${chatId}`);

  await expect(
    page
      .getByText("Click a citation to preview details and keep it pinned while you chat.")
      .first()
  ).toBeVisible();
  await page.getByRole("button", { name: /jane smith/i }).click();

  await expect(page.getByText("Person from Playwright mock")).toBeVisible();
});
