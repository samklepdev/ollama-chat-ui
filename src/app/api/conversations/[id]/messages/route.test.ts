import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConversation, listMessages } from "@/lib/conversations";
import { getDb } from "@/lib/db";
import { POST } from "./route";

beforeEach(() => {
  process.env.DB_PATH = join(tmpdir(), `test-messages-${randomUUID()}.db`);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ndjsonResponse(lines: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
  return { ok: true, body };
}

describe("POST /api/conversations/:id/messages", () => {
  it("streams the assistant reply and persists both messages", async () => {
    const conversation = createConversation(getDb(), "llama3");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      ndjsonResponse([
        `${JSON.stringify({ message: { content: "Hel" }, done: false })}\n`,
        `${JSON.stringify({ message: { content: "lo" }, done: false })}\n${JSON.stringify({ message: { content: "" }, done: true })}\n`,
      ])
    );

    const response = await POST(
      new NextRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "hi" }),
      }),
      { params: Promise.resolve({ id: conversation.id }) }
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Hel");
    expect(text).toContain("lo");

    const messages = listMessages(getDb(), conversation.id);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[0].content).toBe("hi");
    expect(messages[1].content).toBe("Hello");
  });

  it("returns 400 when content is missing", async () => {
    const conversation = createConversation(getDb(), "llama3");

    const response = await POST(
      new NextRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: conversation.id }) }
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown conversation", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/conversations/missing/messages", {
        method: "POST",
        body: JSON.stringify({ content: "hi" }),
      }),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(response.status).toBe(404);
  });

  it("returns 502 with the Ollama error when the chat call fails", async () => {
    const conversation = createConversation(getDb(), "llama3");
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("connection refused"));

    const response = await POST(
      new NextRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "hi" }),
      }),
      { params: Promise.resolve({ id: conversation.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("connection refused");
  });
});
