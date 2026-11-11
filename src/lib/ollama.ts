import type { OllamaModel, Role } from "./types";

const DEFAULT_BASE_URL = "http://localhost:11434";

export function getOllamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
}

export async function listModels(baseUrl: string = getOllamaBaseUrl()): Promise<OllamaModel[]> {
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status} fetching /api/tags`);
  }
  const data = (await response.json()) as { models?: { name: string }[] };
  const models = Array.isArray(data.models) ? data.models : [];
  return models.map((m) => ({ name: m.name }));
}

export interface ChatMessage {
  role: Role;
  content: string;
}

export async function chatStream(
  model: string,
  messages: ChatMessage[],
  baseUrl: string = getOllamaBaseUrl()
): Promise<Response> {
  return fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });
}

export interface OllamaChunk {
  content: string;
  done: boolean;
}

export function parseNdjsonLine(line: string): OllamaChunk | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const json = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean };
    return {
      content: typeof json.message?.content === "string" ? json.message.content : "",
      done: json.done === true,
    };
  } catch {
    return null;
  }
}
