import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getCloudStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        signedIn: false,
        accountEmail: null,
        capabilities: [] as string[],
      };
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      return {
        signedIn: false,
        accountEmail: null,
        capabilities: [] as string[],
      };
    }

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    const capabilities = subscription?.status === "active"
      ? ["billing", "hosted_ai", "managed_google_sync", "managed_microsoft_sync"]
      : [];

    return {
      signedIn: true,
      accountEmail: user.email ?? null,
      capabilities,
    };
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }

    return {
      id: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      image: user.image ?? null,
    };
  },
});

export const registerCurrentDevice = mutation({
  args: {
    deviceName: v.string(),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated to register a device.");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("Authenticated user was not found.");
    }

    const now = Date.now();
    if (!user.createdAt) {
      await ctx.db.patch(user._id, { createdAt: now });
    }
    await ctx.db.patch(user._id, { lastSeenAt: now });

    const existingDevice = await ctx.db
      .query("devices")
      .withIndex("by_user_device", (q) => q.eq("userId", user._id).eq("deviceName", args.deviceName))
      .unique();

    if (existingDevice) {
      await ctx.db.patch(existingDevice._id, {
        platform: args.platform,
        lastSeenAt: now,
      });
      return { deviceId: existingDevice._id };
    }

    const deviceId = await ctx.db.insert("devices", {
      userId: user._id,
      deviceName: args.deviceName,
      platform: args.platform,
      issuedAt: now,
      lastSeenAt: now,
    });

    return { deviceId };
  },
});
