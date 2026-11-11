import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { createConversation } from "@/lib/conversations";
import { getDb } from "@/lib/db";
import { DELETE, GET, PATCH } from "./route";

beforeEach(() => {
  process.env.DB_PATH = join(tmpdir(), `test-conversation-${randomUUID()}.db`);
});

describe("GET /api/conversations/:id", () => {
  it("returns the conversation and its messages", async () => {
    const conversation = createConversation(getDb(), "llama3");

    const response = await GET(
      new NextRequest(`http://localhost/api/conversations/${conversation.id}`),
      { params: Promise.resolve({ id: conversation.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.conversation.id).toBe(conversation.id);
    expect(body.messages).toEqual([]);
  });

  it("returns 404 for an unknown id", async () => {
    const response = await GET(new NextRequest("http://localhost/api/conversations/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/conversations/:id", () => {
  it("renames the conversation", async () => {
    const conversation = createConversation(getDb(), "llama3");

    const response = await PATCH(
      new NextRequest(`http://localhost/api/conversations/${conversation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "Renamed" }),
      }),
      { params: Promise.resolve({ id: conversation.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.title).toBe("Renamed");
  });

  it("returns 404 for an unknown id", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost/api/conversations/missing", {
        method: "PATCH",
        body: JSON.stringify({ title: "Renamed" }),
      }),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/conversations/:id", () => {
  it("deletes the conversation", async () => {
    const conversation = createConversation(getDb(), "llama3");

    const response = await DELETE(
      new NextRequest(`http://localhost/api/conversations/${conversation.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: conversation.id }) }
    );

    expect(response.status).toBe(200);
  });

  it("returns 404 for an unknown id", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/conversations/missing", { method: "DELETE" }),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(response.status).toBe(404);
  });
});
