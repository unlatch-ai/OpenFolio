import { describe, expect, it } from "vitest";
import {
  APP_PEOPLE_BASE_PATH,
  APP_COMPANIES_BASE_PATH,
  APP_INTERACTIONS_BASE_PATH,
  getAppPersonPath,
  getAppCompanyPath,
  getAppInteractionPath,
} from "@/lib/app-routes";

describe("app routes", () => {
  it("uses /app prefix for people paths", () => {
    expect(APP_PEOPLE_BASE_PATH).toBe("/app/people");
    expect(getAppPersonPath("46acdaf4-c4be-4fb3-b456-2b0e363e5c3c")).toBe(
      "/app/people/46acdaf4-c4be-4fb3-b456-2b0e363e5c3c"
    );
  });

  it("uses /app prefix for companies paths", () => {
    expect(APP_COMPANIES_BASE_PATH).toBe("/app/companies");
    expect(getAppCompanyPath("46acdaf4-c4be-4fb3-b456-2b0e363e5c3c")).toBe(
      "/app/companies/46acdaf4-c4be-4fb3-b456-2b0e363e5c3c"
    );
  });

  it("uses /app prefix for interactions paths", () => {
    expect(APP_INTERACTIONS_BASE_PATH).toBe("/app/interactions");
    expect(getAppInteractionPath("46acdaf4-c4be-4fb3-b456-2b0e363e5c3c")).toBe(
      "/app/interactions/46acdaf4-c4be-4fb3-b456-2b0e363e5c3c"
    );
  });
});
