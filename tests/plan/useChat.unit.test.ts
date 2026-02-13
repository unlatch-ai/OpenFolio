import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useChat } from "@/app/app/(dashboard)/plan/hooks/useChat";

const encoder = new TextEncoder();

function createMockStream(chunks: string[]) {
  let index = 0;
  return {
    getReader() {
      return {
        read: async () => {
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }
          const value = encoder.encode(chunks[index]);
          index += 1;
          return { done: false, value };
        },
      };
    },
  };
}

describe("useChat (unit)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("streams assistant content and defers history load for new chats", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/agent") {
        return {
          ok: true,
          headers: new Headers([
            ["X-Chat-Id", "chat-123"],
            ["X-New-Chat", "true"],
          ]),
          body: createMockStream([
            "data: {\"type\":\"text-delta\",\"delta\":\"Hello\"}\n\n",
            "data: {\"type\":\"text-delta\",\"delta\":\" world\"}\n\n",
            "data: [DONE]\n\n",
          ]),
        };
      }

      if (url === "/api/chats/chat-123/messages") {
        return {
          ok: true,
          json: async () => ({
            messages: [],
            chat_updated_at: new Date().toISOString(),
          }),
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result, rerender } = renderHook(
      ({ chatId }) => useChat(chatId),
      { initialProps: { chatId: undefined as string | undefined } }
    );

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    rerender({ chatId: "chat-123" });

    const assistantMessage = result.current.messages.at(-1);
    expect(assistantMessage?.content).toBe("Hello world");
    expect(assistantMessage?.isStreaming).toBe(false);

    const historyCallsBefore = fetchMock.mock.calls.filter((call) => {
      const url = typeof call[0] === "string" ? call[0] : call[0].toString();
      return url === "/api/chats/chat-123/messages";
    });
    expect(historyCallsBefore.length).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    const historyCallsAfter = fetchMock.mock.calls.filter((call) => {
      const url = typeof call[0] === "string" ? call[0] : call[0].toString();
      return url === "/api/chats/chat-123/messages";
    });
    expect(historyCallsAfter.length).toBe(1);
  });

  it("includes selected context in agent requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/agent") {
        const body = init?.body ? JSON.parse(init.body.toString()) : {};
        return {
          ok: true,
          headers: new Headers([
            ["X-Chat-Id", "chat-456"],
            ["X-New-Chat", "false"],
          ]),
          body: createMockStream([
            "data: {\"type\":\"text-delta\",\"delta\":\"Ok\"}\n\n",
            "data: [DONE]\n\n",
          ]),
          json: async () => body,
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Plan with context", {
        selectedContext: [
          { type: "event", id: "11111111-1111-1111-1111-111111111111" },
          { type: "contact", id: "22222222-2222-2222-2222-222222222222" },
        ],
      });
    });

    const agentCall = fetchMock.mock.calls.find(
      (call) => (typeof call[0] === "string" ? call[0] : call[0].toString()) === "/api/agent"
    );
    expect(agentCall).toBeTruthy();
    const init = agentCall?.[1] as RequestInit;
    const parsed = init?.body ? JSON.parse(init.body.toString()) : {};
    expect(parsed.selectedContext).toEqual([
      { type: "event", id: "11111111-1111-1111-1111-111111111111" },
      { type: "contact", id: "22222222-2222-2222-2222-222222222222" },
    ]);
  });
});
