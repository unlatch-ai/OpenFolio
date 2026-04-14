import { ConvexHttpClient } from "convex/browser";
import type { CloudAccountStatus } from "@openfolio/shared-types";
import { api } from "../convex/_generated/api.js";

function getConvexUrl() {
  return (
    process.env.CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.OPENFOLIO_SITE_URL ||
    ""
  );
}

export class HostedClient {
  private readonly client: ConvexHttpClient | null;

  constructor(url = getConvexUrl()) {
    this.client = url ? new ConvexHttpClient(url) : null;
  }

  isConfigured() {
    return this.client !== null;
  }

  async getCloudStatus(): Promise<CloudAccountStatus> {
    if (!this.client) {
      return {
        signedIn: false,
        accountEmail: null,
        capabilities: [],
        hostedBaseUrl: null,
      };
    }

    const result = await this.client.query(api.accounts.getCloudStatus, {});
    return {
      signedIn: result.signedIn,
      accountEmail: result.accountEmail,
      capabilities: result.capabilities as CloudAccountStatus["capabilities"],
      hostedBaseUrl: getConvexUrl(),
    };
  }
}
