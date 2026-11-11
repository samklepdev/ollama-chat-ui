# Ollama Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user web chat UI (Next.js App Router) that talks to a local Ollama server, with multiple persisted conversations, a model picker, streaming responses, and Markdown-rendered assistant messages.

**Architecture:** Next.js API routes proxy all Ollama calls (never called from the browser directly); a SQLite file (`local.db`) persists conversations and messages via hand-written `better-sqlite3` queries (no ORM); the client reads streamed ndjson responses and renders them live.

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript, `better-sqlite3`, `react-markdown` + `remark-gfm` + `rehype-highlight`, CSS Modules, Vitest for API/lib tests.

## Global Constraints

- Persistence is SQLite via `better-sqlite3` with hand-written SQL — no ORM (Prisma/Drizzle).
- Styling is CSS Modules only — no Tailwind or other CSS framework.
- No authentication — single-user local tool.
- Ollama base URL defaults to `http://localhost:11434`, overridable via `OLLAMA_BASE_URL` env var.
- A conversation's `model` is fixed at creation time and never changes.
- Streaming responses use a raw `ReadableStream` passthrough with `Content-Type: application/x-ndjson` — no SSE library, no Vercel AI SDK.
- IDs are generated with `node:crypto`'s `randomUUID()`.
- Automated tests are written with Vitest, covering API routes and `lib/` modules (per spec, not UI components).
- `local.db` and `.idea/` are gitignored (already done).

---

## File Structure

```
src/
  lib/
    db.ts                 # SQLite connection + schema init
    types.ts              # Shared TS types: Conversation, Message, Role, OllamaModel
    conversations.ts      # Data-access functions (CRUD on conversations/messages)
    conversations.test.ts
    ollama.ts             # Ollama HTTP client: listModels, chatStream, parseNdjsonLine
    ollama.test.ts
  app/
    page.tsx              # Main orchestrator (client component)
    page.module.css
    api/
      models/
        route.ts          # GET -> list installed Ollama models
        route.test.ts
      conversations/
        route.ts          # GET list / POST create
        route.test.ts
        [id]/
          route.ts         # GET one (with messages) / PATCH rename / DELETE
          route.test.ts
          messages/
            route.ts       # POST -> append message, stream Ollama reply
            route.test.ts
  components/
    Sidebar.tsx
    Sidebar.module.css
    ChatWindow.tsx
    ChatWindow.module.css
    MessageInput.tsx
    MessageInput.module.css
    ModelPicker.tsx
    ModelPicker.module.css
vitest.config.ts
```

---

### Task 1: Project setup — dependencies and test runner

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm run test` command; `better-sqlite3`, `react-markdown`, `remark-gfm`, `rehype-highlight`, `highlight.js` available as runtime deps; `vitest` available as dev dep.

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
npm install better-sqlite3 react-markdown remark-gfm rehype-highlight highlight.js
```

- [ ] **Step 2: Install dev dependency**

Run:
```bash
npm install -D vitest
```

- [ ] **Step 3: Add the test script to `package.json`**

In `package.json`, inside `"scripts"`, add a `test` entry alongside the existing `dev`/`build`/`start`/`lint`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 5: Verify the test runner works with no tests yet**

Run: `npm run test`
Expected: Vitest reports "No test files found" (or passes with 0 tests) — it should NOT error on config/setup.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add sqlite, markdown, and vitest dependencies"
```

---

### Task 2: Shared types and SQLite data layer

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/db.ts`
- Create: `src/lib/conversations.ts`
- Test: `src/lib/conversations.test.ts`

**Interfaces:**
- Produces:
  - `type Role = "user" | "assistant"`
  - `interface Conversation { id: string; title: string; model: string; createdAt: string; updatedAt: string }`
  - `interface Message { id: string; conversationId: string; role: Role; content: string; createdAt: string }`
  - `interface OllamaModel { name: string }`
  - `createDb(path: string): Database.Database` and `getDb(): Database.Database` from `src/lib/db.ts`
  - From `src/lib/conversations.ts`: `listConversations(db)`, `createConversation(db, model)`, `getConversation(db, id)`, `renameConversation(db, id, title)`, `deleteConversation(db, id)`, `touchConversation(db, id)`, `listMessages(db, conversationId)`, `addMessage(db, conversationId, role, content)`.

- [ ] **Step 1: Create shared types**

`src/lib/types.ts`:
```ts
export type Role = "user" | "assistant";

export interface Conversation {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  createdAt: string;
}

export interface OllamaModel {
  name: string;
}
```

- [ ] **Step 2: Create the SQLite connection module**

`src/lib/db.ts`:
```ts
import Database from "better-sqlite3";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New chat',
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export function createDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

let singleton: Db | null = null;
let singletonPath: string | null = null;

export function getDb(): Db {
  const path = process.env.DB_PATH ?? "local.db";
  if (!singleton || singletonPath !== path) {
    singleton = createDb(path);
    singletonPath = path;
  }
  return singleton;
}
```

`getDb()` re-opens the connection whenever `DB_PATH` differs from the last call, rather than caching forever. In production this is a no-op (the env var doesn't change at runtime), but it means tests can isolate themselves just by setting `process.env.DB_PATH` to a fresh path in `beforeEach` — no `vi.resetModules()` or dynamic `import()` gymnastics needed.

- [ ] **Step 3: Write the failing tests for the data-access layer**

`src/lib/conversations.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "./db";
import {
  addMessage,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  renameConversation,
  touchConversation,
} from "./conversations";

let db: Db;

beforeEach(() => {
  db = createDb(":memory:");
});

describe("createConversation", () => {
  it("creates a conversation with a default title and the given model", () => {
    const conversation = createConversation(db, "llama3");
    expect(conversation.model).toBe("llama3");
    expect(conversation.title).toBe("New chat");
    expect(conversation.id).toBeTruthy();
  });
});

describe("listConversations", () => {
  it("returns conversations newest-updated first", () => {
    const first = createConversation(db, "llama3");
    const second = createConversation(db, "llama3");
    touchConversation(db, first.id);

    const result = listConversations(db);
    expect(result.map((c) => c.id)).toEqual([first.id, second.id]);
  });
});

describe("getConversation", () => {
  it("returns null for an unknown id", () => {
    expect(getConversation(db, "missing")).toBeNull();
  });

  it("returns the conversation for a known id", () => {
    const created = createConversation(db, "llama3");
    expect(getConversation(db, created.id)?.id).toBe(created.id);
  });
});

describe("renameConversation", () => {
  it("updates the title and returns the updated conversation", () => {
    const created = createConversation(db, "llama3");
    const renamed = renameConversation(db, created.id, "My chat");
    expect(renamed?.title).toBe("My chat");
  });

  it("returns null for an unknown id", () => {
    expect(renameConversation(db, "missing", "x")).toBeNull();
  });
});

describe("deleteConversation", () => {
  it("deletes the conversation and cascades to its messages", () => {
    const created = createConversation(db, "llama3");
    addMessage(db, created.id, "user", "hello");

    const deleted = deleteConversation(db, created.id);

    expect(deleted).toBe(true);
    expect(getConversation(db, created.id)).toBeNull();
    expect(listMessages(db, created.id)).toEqual([]);
  });

  it("returns false for an unknown id", () => {
    expect(deleteConversation(db, "missing")).toBe(false);
  });
});

describe("messages", () => {
  it("adds and lists messages in insertion order", () => {
    const created = createConversation(db, "llama3");
    addMessage(db, created.id, "user", "hi");
    addMessage(db, created.id, "assistant", "hello there");

    const messages = listMessages(db, created.id);

    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages.map((m) => m.content)).toEqual(["hi", "hello there"]);
    expect(messages.every((m) => m.conversationId === created.id)).toBe(true);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/lib/conversations.test.ts`
Expected: FAIL — `src/lib/conversations.ts` does not exist yet.

- [ ] **Step 5: Implement the data-access layer**

`src/lib/conversations.ts`:
```ts
import { randomUUID } from "node:crypto";
import type { Db } from "./db";
import type { Conversation, Message, Role } from "./types";

interface ConversationRow {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: Role;
  content: string;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function listConversations(db: Db): Conversation[] {
  const rows = db
    .prepare("SELECT * FROM conversations ORDER BY updated_at DESC")
    .all() as ConversationRow[];
  return rows.map(rowToConversation);
}

export function createConversation(db: Db, model: string): Conversation {
  const id = randomUUID();
  const timestamp = nowIso();
  db.prepare(
    "INSERT INTO conversations (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, "New chat", model, timestamp, timestamp);
  return { id, title: "New chat", model, createdAt: timestamp, updatedAt: timestamp };
}

export function getConversation(db: Db, id: string): Conversation | null {
  const row = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(id) as ConversationRow | undefined;
  return row ? rowToConversation(row) : null;
}

export function renameConversation(db: Db, id: string, title: string): Conversation | null {
  const timestamp = nowIso();
  const result = db
    .prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?")
    .run(title, timestamp, id);
  if (result.changes === 0) return null;
  return getConversation(db, id);
}

export function deleteConversation(db: Db, id: string): boolean {
  const result = db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  return result.changes > 0;
}

export function touchConversation(db: Db, id: string): void {
  db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(nowIso(), id);
}

export function listMessages(db: Db, conversationId: string): Message[] {
  const rows = db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY rowid ASC")
    .all(conversationId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function addMessage(db: Db, conversationId: string, role: Role, content: string): Message {
  const id = randomUUID();
  const timestamp = nowIso();
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, conversationId, role, content, timestamp);
  return { id, conversationId, role, content, createdAt: timestamp };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/conversations.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/db.ts src/lib/conversations.ts src/lib/conversations.test.ts
git commit -m "feat: add SQLite data-access layer for conversations and messages"
```

---

### Task 3: Ollama HTTP client

**Files:**
- Create: `src/lib/ollama.ts`
- Test: `src/lib/ollama.test.ts`

**Interfaces:**
- Consumes: `OllamaModel`, `Role` from `src/lib/types.ts`.
- Produces: `getOllamaBaseUrl(): string`, `listModels(baseUrl?): Promise<OllamaModel[]>`, `interface ChatMessage { role: Role; content: string }`, `chatStream(model: string, messages: ChatMessage[], baseUrl?): Promise<Response>`, `interface OllamaChunk { content: string; done: boolean }`, `parseNdjsonLine(line: string): OllamaChunk | null`.

- [ ] **Step 1: Write the failing tests**

`src/lib/ollama.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/ollama.test.ts`
Expected: FAIL — `src/lib/ollama.ts` does not exist yet.

- [ ] **Step 3: Implement the Ollama client**

`src/lib/ollama.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/ollama.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ollama.ts src/lib/ollama.test.ts
git commit -m "feat: add Ollama HTTP client for model listing and chat streaming"
```

---

### Task 4: `/api/models` and `/api/conversations` (list/create) routes

**Files:**
- Create: `src/app/api/models/route.ts`
- Test: `src/app/api/models/route.test.ts`
- Create: `src/app/api/conversations/route.ts`
- Test: `src/app/api/conversations/route.test.ts`

**Interfaces:**
- Consumes: `listModels` from `src/lib/ollama.ts`; `listConversations`, `createConversation` from `src/lib/conversations.ts`; `getDb` from `src/lib/db.ts`.
- Produces: `GET /api/models` → `{ models: OllamaModel[] }` or `{ error: string }` (502); `GET /api/conversations` → `Conversation[]`; `POST /api/conversations` with body `{ model: string }` → created `Conversation` (201) or `{ error: string }` (400).

- [ ] **Step 1: Write the failing test for `/api/models`**

`src/app/api/models/route.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/api/models/route.test.ts`
Expected: FAIL — `src/app/api/models/route.ts` does not exist yet.

- [ ] **Step 3: Implement `/api/models`**

`src/app/api/models/route.ts`:
```ts
import { NextResponse } from "next/server";
import { listModels } from "@/lib/ollama";

export async function GET() {
  try {
    const models = await listModels();
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach Ollama: ${(error as Error).message}` },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/app/api/models/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for `/api/conversations`**

`src/app/api/conversations/route.test.ts`:
```ts
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
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/app/api/conversations/route.test.ts`
Expected: FAIL — `src/app/api/conversations/route.ts` does not exist yet.

- [ ] **Step 7: Implement `/api/conversations`**

`src/app/api/conversations/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createConversation, listConversations } from "@/lib/conversations";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  return NextResponse.json(listConversations(db));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  if (!model) {
    return NextResponse.json({ error: "model is required" }, { status: 400 });
  }

  const db = getDb();
  const conversation = createConversation(db, model);
  return NextResponse.json(conversation, { status: 201 });
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/app/api/conversations/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add src/app/api/models/route.ts src/app/api/models/route.test.ts \
  src/app/api/conversations/route.ts src/app/api/conversations/route.test.ts
git commit -m "feat: add /api/models and /api/conversations list+create routes"
```

---

### Task 5: `/api/conversations/[id]` (get/rename/delete) route

**Files:**
- Create: `src/app/api/conversations/[id]/route.ts`
- Test: `src/app/api/conversations/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getConversation`, `renameConversation`, `deleteConversation`, `listMessages` from `src/lib/conversations.ts`; `getDb` from `src/lib/db.ts`.
- Produces: `GET /api/conversations/:id` → `{ conversation: Conversation; messages: Message[] }` (200) or `{ error }` (404); `PATCH /api/conversations/:id` body `{ title: string }` → updated `Conversation` (200) or 404; `DELETE /api/conversations/:id` → `{ ok: true }` (200) or 404.

- [ ] **Step 1: Write the failing tests**

`src/app/api/conversations/[id]/route.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/api/conversations/[id]/route.test.ts"`
Expected: FAIL — `src/app/api/conversations/[id]/route.ts` does not exist yet.

- [ ] **Step 3: Implement the route**

`src/app/api/conversations/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import {
  deleteConversation,
  getConversation,
  listMessages,
  renameConversation,
} from "@/lib/conversations";
import { getDb } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getDb();
  const conversation = getConversation(db, id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return NextResponse.json({ conversation, messages: listMessages(db, id) });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const updated = renameConversation(getDb(), id, title);
  if (!updated) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const deleted = deleteConversation(getDb(), id);
  if (!deleted) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "src/app/api/conversations/[id]/route.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/conversations/[id]/route.ts" "src/app/api/conversations/[id]/route.test.ts"
git commit -m "feat: add get/rename/delete route for a single conversation"
```

---

### Task 6: `/api/conversations/[id]/messages` streaming route

**Files:**
- Create: `src/app/api/conversations/[id]/messages/route.ts`
- Test: `src/app/api/conversations/[id]/messages/route.test.ts`

**Interfaces:**
- Consumes: `addMessage`, `getConversation`, `listMessages`, `touchConversation` from `src/lib/conversations.ts`; `chatStream`, `parseNdjsonLine` from `src/lib/ollama.ts`; `getDb` from `src/lib/db.ts`.
- Produces: `POST /api/conversations/:id/messages` body `{ content: string }` → on success, a `200` response whose body is the raw ndjson stream forwarded from Ollama (`Content-Type: application/x-ndjson`); on failure, `{ error: string }` with `400`/`404`/`502`.

- [ ] **Step 1: Write the failing tests**

`src/app/api/conversations/[id]/messages/route.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/api/conversations/[id]/messages/route.test.ts"`
Expected: FAIL — `src/app/api/conversations/[id]/messages/route.ts` does not exist yet.

- [ ] **Step 3: Implement the streaming route**

`src/app/api/conversations/[id]/messages/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import {
  addMessage,
  getConversation,
  listMessages,
  touchConversation,
} from "@/lib/conversations";
import { getDb } from "@/lib/db";
import { chatStream, parseNdjsonLine } from "@/lib/ollama";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const db = getDb();
  const conversation = getConversation(db, id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  addMessage(db, id, "user", content);
  const history = listMessages(db, id);

  let ollamaResponse: Response;
  try {
    ollamaResponse = await chatStream(
      conversation.model,
      history.map(({ role, content: messageContent }) => ({ role, content: messageContent }))
    );
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach Ollama: ${(error as Error).message}` },
      { status: 502 }
    );
  }

  if (!ollamaResponse.ok || !ollamaResponse.body) {
    const detail = await ollamaResponse.text().catch(() => "");
    return NextResponse.json(
      { error: `Ollama error (${ollamaResponse.status}): ${detail}` },
      { status: 502 }
    );
  }

  const reader = ollamaResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantContent = "";

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) {
          const chunk = parseNdjsonLine(buffer);
          if (chunk) assistantContent += chunk.content;
        }
        addMessage(db, id, "assistant", assistantContent);
        touchConversation(db, id);
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const chunk = parseNdjsonLine(line);
        if (chunk) assistantContent += chunk.content;
      }
      controller.enqueue(value);
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "src/app/api/conversations/[id]/messages/route.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/conversations/[id]/messages/route.ts" \
  "src/app/api/conversations/[id]/messages/route.test.ts"
git commit -m "feat: add streaming chat proxy route for conversation messages"
```

---

### Task 7: `Sidebar` component

**Files:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/Sidebar.module.css`

**Interfaces:**
- Consumes: `Conversation` from `src/lib/types.ts`.
- Produces:
```ts
interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}
export function Sidebar(props: SidebarProps): JSX.Element;
```

- [ ] **Step 1: Implement the component**

`src/components/Sidebar.tsx`:
```tsx
"use client";

import { useState } from "react";
import type { Conversation } from "@/lib/types";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({
  conversations,
  activeConversationId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  function startEditing(conversation: Conversation) {
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
  }

  function commitEditing() {
    if (editingId && editingTitle.trim()) {
      onRename(editingId, editingTitle.trim());
    }
    setEditingId(null);
  }

  return (
    <nav className={styles.sidebar}>
      <button className={styles.newChat} onClick={onNewChat} type="button">
        + New chat
      </button>
      <ul className={styles.list}>
        {conversations.map((conversation) => (
          <li
            key={conversation.id}
            className={
              conversation.id === activeConversationId ? styles.itemActive : styles.item
            }
          >
            {editingId === conversation.id ? (
              <input
                autoFocus
                className={styles.titleInput}
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={commitEditing}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEditing();
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <button
                className={styles.title}
                onClick={() => onSelect(conversation.id)}
                onDoubleClick={() => startEditing(conversation)}
                type="button"
              >
                {conversation.title}
              </button>
            )}
            <span className={styles.model}>{conversation.model}</span>
            <button
              aria-label={`Delete ${conversation.title}`}
              className={styles.deleteButton}
              onClick={() => onDelete(conversation.id)}
              type="button"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Implement the stylesheet**

`src/components/Sidebar.module.css`:
```css
.sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--foreground);
  padding: 12px;
  gap: 12px;
  height: 100%;
  overflow-y: auto;
}

.newChat {
  padding: 8px 12px;
  border: 1px solid var(--foreground);
  border-radius: 6px;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  text-align: left;
}

.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item,
.itemActive {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
}

.itemActive {
  background: rgba(127, 127, 127, 0.2);
}

.title,
.titleInput {
  flex: 1;
  background: transparent;
  border: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model {
  font-size: 11px;
  opacity: 0.6;
}

.deleteButton {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
}

.deleteButton:hover {
  opacity: 1;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `Sidebar.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx src/components/Sidebar.module.css
git commit -m "feat: add Sidebar component for conversation list"
```

---

### Task 8: `ChatWindow` component (with Markdown rendering)

**Files:**
- Create: `src/components/ChatWindow.tsx`
- Create: `src/components/ChatWindow.module.css`

**Interfaces:**
- Consumes: `Message` from `src/lib/types.ts`.
- Produces:
```ts
interface ChatWindowProps {
  messages: Message[];
  isStreaming: boolean;
  error: string | null;
}
export function ChatWindow(props: ChatWindowProps): JSX.Element;
```

- [ ] **Step 1: Implement the component**

`src/components/ChatWindow.tsx`:
```tsx
"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github-dark.css";
import type { Message } from "@/lib/types";
import styles from "./ChatWindow.module.css";

interface ChatWindowProps {
  messages: Message[];
  isStreaming: boolean;
  error: string | null;
}

export function ChatWindow({ messages, isStreaming, error }: ChatWindowProps) {
  return (
    <div className={styles.window}>
      {messages.map((message) => (
        <div
          key={message.id}
          className={message.role === "user" ? styles.userBubble : styles.assistantBubble}
        >
          {message.role === "assistant" ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {message.content || (isStreaming ? "…" : "")}
            </ReactMarkdown>
          ) : (
            <p>{message.content}</p>
          )}
        </div>
      ))}
      {error ? <div className={styles.errorBubble}>{error}</div> : null}
    </div>
  );
}
```

- [ ] **Step 2: Implement the stylesheet**

`src/components/ChatWindow.module.css`:
```css
.window {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.userBubble {
  align-self: flex-end;
  max-width: 70%;
  background: rgba(100, 150, 255, 0.15);
  border-radius: 10px;
  padding: 8px 12px;
}

.assistantBubble {
  align-self: flex-start;
  max-width: 70%;
  background: rgba(127, 127, 127, 0.12);
  border-radius: 10px;
  padding: 8px 12px;
}

.errorBubble {
  align-self: flex-start;
  max-width: 70%;
  background: rgba(255, 80, 80, 0.15);
  border: 1px solid rgba(255, 80, 80, 0.4);
  border-radius: 10px;
  padding: 8px 12px;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `ChatWindow.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ChatWindow.tsx src/components/ChatWindow.module.css
git commit -m "feat: add ChatWindow component with markdown rendering"
```

---

### Task 9: `MessageInput` and `ModelPicker` components

**Files:**
- Create: `src/components/MessageInput.tsx`
- Create: `src/components/MessageInput.module.css`
- Create: `src/components/ModelPicker.tsx`
- Create: `src/components/ModelPicker.module.css`

**Interfaces:**
- Consumes: `OllamaModel` from `src/lib/types.ts`.
- Produces:
```ts
interface MessageInputProps {
  disabled: boolean;
  onSubmit: (content: string) => void;
}
export function MessageInput(props: MessageInputProps): JSX.Element;

interface ModelPickerProps {
  models: OllamaModel[];
  error: string | null;
  onSelect: (model: string) => void;
}
export function ModelPicker(props: ModelPickerProps): JSX.Element;
```

- [ ] **Step 1: Implement `MessageInput`**

`src/components/MessageInput.tsx`:
```tsx
"use client";

import { useState, type KeyboardEvent } from "react";
import styles from "./MessageInput.module.css";

interface MessageInputProps {
  disabled: boolean;
  onSubmit: (content: string) => void;
}

export function MessageInput({ disabled, onSubmit }: MessageInputProps) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className={styles.inputBar}>
      <textarea
        className={styles.textarea}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message the model…"
        rows={2}
      />
      <button
        className={styles.sendButton}
        disabled={disabled || !value.trim()}
        onClick={submit}
        type="button"
      >
        Send
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Implement `MessageInput.module.css`**

`src/components/MessageInput.module.css`:
```css
.inputBar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--foreground);
}

.textarea {
  flex: 1;
  resize: none;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--foreground);
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 14px;
}

.sendButton {
  padding: 0 16px;
  border-radius: 6px;
  border: 1px solid var(--foreground);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.sendButton:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Implement `ModelPicker`**

`src/components/ModelPicker.tsx`:
```tsx
"use client";

import type { OllamaModel } from "@/lib/types";
import styles from "./ModelPicker.module.css";

interface ModelPickerProps {
  models: OllamaModel[];
  error: string | null;
  onSelect: (model: string) => void;
}

export function ModelPicker({ models, error, onSelect }: ModelPickerProps) {
  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (models.length === 0) {
    return <div className={styles.empty}>No models installed. Run `ollama pull &lt;model&gt;`.</div>;
  }

  return (
    <div className={styles.picker}>
      <p className={styles.prompt}>Choose a model to start a new chat:</p>
      <ul className={styles.list}>
        {models.map((model) => (
          <li key={model.name}>
            <button className={styles.option} onClick={() => onSelect(model.name)} type="button">
              {model.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Implement `ModelPicker.module.css`**

`src/components/ModelPicker.module.css`:
```css
.picker {
  margin: auto;
  text-align: center;
  padding: 24px;
}

.prompt {
  margin-bottom: 12px;
  opacity: 0.8;
}

.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.option {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--foreground);
  background: transparent;
  color: inherit;
  cursor: pointer;
  min-width: 200px;
}

.error,
.empty {
  margin: auto;
  padding: 24px;
  text-align: center;
  opacity: 0.8;
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `MessageInput.tsx` or `ModelPicker.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/components/MessageInput.tsx src/components/MessageInput.module.css \
  src/components/ModelPicker.tsx src/components/ModelPicker.module.css
git commit -m "feat: add MessageInput and ModelPicker components"
```

---

### Task 10: Wire up `page.tsx` and remove scaffold boilerplate

**Files:**
- Modify: `src/app/page.tsx` (replace entirely)
- Modify: `src/app/page.module.css` (replace entirely)
- Delete: unused scaffold assets referenced only by the old `page.tsx` (check `public/next.svg`, `public/vercel.svg` usage first — leave in place if anything else references them; otherwise safe to leave, they're harmless static assets)

**Interfaces:**
- Consumes: `Sidebar`, `ChatWindow`, `MessageInput`, `ModelPicker` components; `Conversation`, `Message`, `OllamaModel` types; REST endpoints from Tasks 4–6.

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { MessageInput } from "@/components/MessageInput";
import { ModelPicker } from "@/components/ModelPicker";
import { Sidebar } from "@/components/Sidebar";
import type { Conversation, Message, OllamaModel } from "@/lib/types";
import styles from "./page.module.css";

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingNewChat, setPendingNewChat] = useState(true);

  const refreshConversations = useCallback(async () => {
    const response = await fetch("/api/conversations");
    const data = await response.json();
    setConversations(data);
  }, []);

  useEffect(() => {
    refreshConversations();
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setModelsError(data.error);
        } else {
          setModels(data.models);
        }
      })
      .catch((error) => setModelsError(String(error)));
  }, [refreshConversations]);

  async function selectConversation(id: string) {
    const response = await fetch(`/api/conversations/${id}`);
    const data = await response.json();
    setActiveConversationId(id);
    setMessages(data.messages);
    setPendingNewChat(false);
    setChatError(null);
  }

  function startNewChat() {
    setActiveConversationId(null);
    setMessages([]);
    setPendingNewChat(true);
    setChatError(null);
  }

  async function pickModelForNewChat(model: string) {
    const response = await fetch("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ model }),
    });
    const conversation: Conversation = await response.json();
    setConversations((prev) => [conversation, ...prev]);
    setActiveConversationId(conversation.id);
    setMessages([]);
    setPendingNewChat(false);
  }

  async function renameConversation(id: string, title: string) {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      startNewChat();
    }
  }

  async function sendMessage(content: string) {
    if (!activeConversationId) return;

    const userMessage: Message = {
      id: `local-${Date.now()}`,
      conversationId: activeConversationId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: Message = {
      id: `local-${Date.now()}-assistant`,
      conversationId: activeConversationId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);
    setChatError(null);

    try {
      const response = await fetch(`/api/conversations/${activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({ error: "Unknown error" }));
        setChatError(data.error);
        setIsStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed);
            if (typeof json.message?.content === "string") {
              accumulated += json.message.content;
            }
          } catch {
            // Ignore partial/malformed lines; the buffer handles split chunks.
          }
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessage.id ? { ...m, content: accumulated } : m))
        );
      }
    } catch (error) {
      setChatError(`Could not reach the server: ${(error as Error).message}`);
    } finally {
      setIsStreaming(false);
      refreshConversations();
    }
  }

  return (
    <div className={styles.page}>
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelect={selectConversation}
        onNewChat={startNewChat}
        onRename={renameConversation}
        onDelete={deleteConversation}
      />
      <main className={styles.main}>
        {pendingNewChat ? (
          <ModelPicker models={models} error={modelsError} onSelect={pickModelForNewChat} />
        ) : (
          <>
            <ChatWindow messages={messages} isStreaming={isStreaming} error={chatError} />
            <MessageInput disabled={isStreaming} onSubmit={sendMessage} />
          </>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/app/page.module.css`**

```css
.page {
  display: flex;
  height: 100vh;
  width: 100%;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
```

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all previously-passing tests still PASS (page.tsx has no automated tests per spec scope).

- [ ] **Step 4: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev`, open `http://localhost:3000`. With a local Ollama server running (`ollama serve`) and at least one model pulled (`ollama pull llama3` or similar):
1. Confirm the model picker shows installed models.
2. Pick a model, send a message, confirm the reply streams in token-by-token and renders Markdown/code blocks.
3. Confirm the new conversation appears in the sidebar.
4. Reload the page — confirm the conversation and its messages persist.
5. Rename and delete a conversation from the sidebar; confirm both work.
6. Stop the Ollama server and send a message; confirm an inline error bubble appears instead of a silent failure.

If Ollama is not available in this environment, explicitly note that this step could not be exercised end-to-end, rather than claiming it was verified.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/app/page.module.css
git commit -m "feat: wire up chat UI page with sidebar, model picker, and streaming"
```

---

## Post-plan notes

- `local.db` will be created in the project root on first run (gitignored already).
- `OLLAMA_BASE_URL` can be set in `.env.local` (already gitignored via `.env*`) if Ollama runs somewhere other than `localhost:11434`.
