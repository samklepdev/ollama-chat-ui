import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";

beforeEach(() => {
  process.env.DB_PATH = join(tmpdir(), `test-conversations-${randomUUID()}.db`);
});

describe("GET /api/conversations", () => {
  it("returns an empty list when there are no conversations", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns created conversations", async () => {
    await POST(
      new NextRequest("http://localhost/api/conversations", {
        method: "POST",
        body: JSON.stringify({ model: "llama3" }),
      })
    );

    const response = await GET();
    const body = await response.json();

    expect(body).toHaveLength(1);
    expect(body[0].model).toBe("llama3");
  });
});

describe("POST /api/conversations", () => {
  it("creates a conversation for the given model", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/conversations", {
        method: "POST",
        body: JSON.stringify({ model: "llama3" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.model).toBe("llama3");
    expect(body.title).toBe("New chat");
  });

  it("returns 400 when model is missing", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/conversations", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
  });
});
