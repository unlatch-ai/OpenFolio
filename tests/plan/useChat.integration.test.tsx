import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function ChatHarness({ chatId }: { chatId?: string }) {
  const { messages, sendMessage } = useChat(chatId);

  return (
    <div>
      <button type="button" onClick={() => sendMessage("Hi")}>
        Send
      </button>
      {messages.map((message, index) => (
        <div key={`${message.role}-${index}`}>{message.content}</div>
      ))}
    </div>
  );
}

describe("useChat (integration)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
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
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("keeps the streamed message visible after chatId change", async () => {
    const user = userEvent.setup();
    const { rerender, getByText } = render(<ChatHarness />);

    await user.click(getByText("Send"));

    await waitFor(() => {
      expect(getByText("Hello world")).toBeTruthy();
    });

    rerender(<ChatHarness chatId="chat-123" />);

    expect(getByText("Hello world")).toBeTruthy();
  });
});
