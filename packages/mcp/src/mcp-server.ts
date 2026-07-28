import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { OpenFolioCore } from "@openfolio/core";

const MCP_ENABLED_KEY = "mcp.enabled";
const MCP_DISABLED_MESSAGE = "OpenFolio MCP access is off in OpenFolio Settings. Turn on MCP before AI clients can search your local relationship graph.";

export function isMcpEnabled(core: OpenFolioCore) {
  return core.db.getSetting(MCP_ENABLED_KEY) === "1";
}

export function getMcpDisabledMessage() {
  return MCP_DISABLED_MESSAGE;
}

export async function startOpenFolioMcpServer(options?: { dbPath?: string }) {
  const core = new OpenFolioCore({ dbPath: options?.dbPath });
  const server = new McpServer(
    {
      name: "openfolio",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
      },
    }
  );

  if (!isMcpEnabled(core)) {
    server.registerTool(
      "openfolio_mcp_status",
      {
        title: "OpenFolio MCP Status",
        description: "Explain why OpenFolio MCP tools are not available.",
        inputSchema: z.object({}),
      },
      async () => ({
        content: [
          {
            type: "text",
            text: MCP_DISABLED_MESSAGE,
          },
        ],
        structuredContent: { enabled: false, message: MCP_DISABLED_MESSAGE },
      })
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
    return server;
  }

  server.registerTool(
    "search",
    {
      title: "Search OpenFolio",
      description: "Search local people, threads, messages, notes, and reminders.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).optional(),
      }),
    },
    async ({ query, limit }) => {
      const results = await core.search(query, limit ?? 8);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
        structuredContent: { results },
      };
    }
  );

  server.registerTool(
    "get_person",
    {
      title: "Get Person",
      description: "Fetch a local person record by id.",
      inputSchema: z.object({
        personId: z.string(),
      }),
    },
    async ({ personId }) => {
      const person = core.getPerson(personId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(person ?? null, null, 2),
          },
        ],
        structuredContent: { person: person ?? null },
      };
    }
  );

  server.registerTool(
    "get_person_profile",
    {
      title: "Get Person Profile",
      description: "Fetch a dense local relationship profile for a person.",
      inputSchema: z.object({
        personId: z.string(),
      }),
    },
    async ({ personId }) => {
      const profile = core.getPersonProfile(personId);
      return {
        content: [{ type: "text", text: JSON.stringify(profile ?? null, null, 2) }],
        structuredContent: { profile: profile ?? null },
      };
    }
  );

  server.registerTool(
    "get_thread",
    {
      title: "Get Thread",
      description: "Fetch thread participants and recent messages.",
      inputSchema: z.object({
        threadId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    },
    async ({ threadId, limit }) => {
      const detail = core.getThreadDetail(threadId);
      const messages = core.getThreadMessages(threadId, limit ?? 50);
      return {
        content: [{ type: "text", text: JSON.stringify({ detail, messages }, null, 2) }],
        structuredContent: { detail, messages },
      };
    }
  );

  server.registerTool(
    "add_note",
    {
      title: "Add Note",
      description: "Add a note to a local entity.",
      inputSchema: z.object({
        entityType: z.enum(["person", "thread", "group"]),
        entityId: z.string(),
        content: z.string().min(1),
      }),
    },
    async ({ entityType, entityId, content }) => {
      const note = core.addNote(entityType, entityId, content);
      return {
        content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
        structuredContent: { note },
      };
    }
  );

  server.registerTool(
    "add_reminder",
    {
      title: "Add Reminder",
      description: "Create a reminder tied to a person or generic task.",
      inputSchema: z.object({
        title: z.string().min(1),
        personId: z.string().nullable().optional(),
        dueAt: z.number().nullable().optional(),
      }),
    },
    async ({ title, personId, dueAt }) => {
      const reminder = core.addReminder(title, personId ?? null, dueAt ?? null);
      return {
        content: [{ type: "text", text: JSON.stringify(reminder, null, 2) }],
        structuredContent: { reminder },
      };
    }
  );

  server.registerTool(
    "list_groups",
    {
      title: "List Groups",
      description: "List locally defined OpenFolio groups.",
      inputSchema: z.object({}),
    },
    async () => {
      const groups = core.db.listGroups();
      return {
        content: [{ type: "text", text: JSON.stringify(groups, null, 2) }],
        structuredContent: { groups },
      };
    }
  );

  server.registerTool(
    "follow_up_suggestions",
    {
      title: "Follow-up Suggestions",
      description: "List local reminder suggestions derived from message recency.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).optional(),
      }),
    },
    async ({ limit }) => {
      const suggestions = core.getReminderSuggestions(limit ?? 10);
      return {
        content: [{ type: "text", text: JSON.stringify(suggestions, null, 2) }],
        structuredContent: { suggestions },
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
