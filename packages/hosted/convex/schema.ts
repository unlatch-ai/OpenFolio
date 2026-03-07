import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
    lastSeenAt: v.optional(v.number()),
  }).index("email", ["email"]),

  devices: defineTable({
    userId: v.id("users"),
    deviceName: v.string(),
    platform: v.string(),
    issuedAt: v.number(),
    lastSeenAt: v.number(),
  }).index("by_user", ["userId"]).index("by_user_device", ["userId", "deviceName"]),

  subscriptions: defineTable({
    userId: v.id("users"),
    status: v.union(v.literal("inactive"), v.literal("active"), v.literal("past_due")),
    plan: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  hostedCredentials: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("google"), v.literal("microsoft")),
    encryptedSecret: v.string(),
    createdAt: v.number(),
  }).index("by_user_provider", ["userId", "provider"]),

  aiJobs: defineTable({
    userId: v.optional(v.id("users")),
    requestKind: v.string(),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});
