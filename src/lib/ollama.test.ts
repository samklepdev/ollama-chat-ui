import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatStream, getOllamaBaseUrl, listModels, parseNdjsonLine } from "./ollama";

describe("parseNdjsonLine", () => {
  it("parses a content chunk", () => {
    const line = JSON.stringify({ message: { content: "Hi" }, done: false });
    expect(parseNdjsonLine(line)).toEqual({ content: "Hi", done: false });
  });

  it("parses a final done chunk with no content", () => {
    const line = JSON.stringify({ message: { content: "" }, done: true });
    expect(parseNdjsonLine(line)).toEqual({ content: "", done: true });
  });

  it("returns null for a blank line", () => {
    expect(parseNdjsonLine("   ")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseNdjsonLine("{not json")).toBeNull();
  });
});

describe("getOllamaBaseUrl", () => {
  const originalEnv = process.env.OLLAMA_BASE_URL;

  afterEach(() => {
    process.env.OLLAMA_BASE_URL = originalEnv;
  });

  it("defaults to localhost:11434", () => {
    delete process.env.OLLAMA_BASE_URL;
    expect(getOllamaBaseUrl()).toBe("http://localhost:11434");
  });

  it("uses OLLAMA_BASE_URL when set", () => {
    process.env.OLLAMA_BASE_URL = "http://example.com:1234";
    expect(getOllamaBaseUrl()).toBe("http://example.com:1234");
  });
});

describe("listModels", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the model list from /api/tags", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: "llama3" }, { name: "mistral" }] }),
    });

    const models = await listModels("http://localhost:11434");

    expect(fetch).toHaveBeenCalledWith("http://localhost:11434/api/tags");
    expect(models).toEqual([{ name: "llama3" }, { name: "mistral" }]);
  });

  it("throws when Ollama responds with an error status", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    await expect(listModels("http://localhost:11434")).rejects.toThrow("500");
  });
});

describe("chatStream", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /api/chat with stream: true", async () => {
    const fakeResponse = { ok: true };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fakeResponse);

    const result = await chatStream(
      "llama3",
      [{ role: "user", content: "hi" }],
      "http://localhost:11434"
    );

    expect(result).toBe(fakeResponse);
    expect(fetch).toHaveBeenCalledWith("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    });
  });
});
