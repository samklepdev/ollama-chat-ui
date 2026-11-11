import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/models", () => {
  it("returns the installed models", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: "llama3" }] }),
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ models: [{ name: "llama3" }] });
  });

  it("returns a 502 with an error message when Ollama is unreachable", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("fetch failed"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("fetch failed");
  });
});
