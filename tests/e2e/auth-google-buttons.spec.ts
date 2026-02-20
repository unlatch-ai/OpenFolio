import { test, expect } from "@playwright/test";

test("login shows Google button", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("img", { name: /sign in with google/i })
  ).toBeVisible();
});

test("signup with token shows Google button", async ({ page }) => {
  await page.route("**/api/auth/invite/preview*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("token") !== "test-token") {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid invite" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "app",
        email: "test@example.com",
      }),
    });
  });

  await page.goto("/signup?token=test-token");
  await expect(
    page.getByRole("img", { name: /sign up with google/i })
  ).toBeVisible();
});

test("signup without token shows invite-required message", async ({ page }) => {
  await page.goto("/signup");
  await expect(
    page.getByText(/invite required/i)
  ).toBeVisible();
});
