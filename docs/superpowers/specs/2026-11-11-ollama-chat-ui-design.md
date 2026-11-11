# Ollama Chat UI — Design

## Purpose

A web UI for chatting with locally-running Ollama models. Single-user personal
tool: pick an installed model, chat with it, keep a history of past
conversations across reloads.

## Architecture

- Next.js App Router (already scaffolded via `create-next-app`).
- API routes under `src/app/api/**` act as a thin proxy/session layer between
  the browser and the local Ollama server (`http://localhost:11434`).
- Persistence: SQLite file (`local.db`, gitignored) via `better-sqlite3`, with
  a small hand-written data-access module (no ORM — schema is two tables).
- Styling: CSS Modules, matching the current scaffold (no Tailwind).
- No auth — single user, local tool.

## Data model (SQLite)

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New chat',
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

A conversation's `model` is fixed at creation time (chosen from the model
picker) and does not change for the life of the conversation, since each
Ollama `/api/chat` call is tied to one model.

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/models` | GET | Proxies Ollama `/api/tags`; returns installed model names for the picker |
| `/api/conversations` | GET | List all conversations (id, title, model, updated_at), newest first, for the sidebar |
| `/api/conversations` | POST | Create a new conversation `{ model }` → returns new conversation with default title "New chat" |
| `/api/conversations/:id` | GET | Full message history for one conversation |
| `/api/conversations/:id` | PATCH | Rename (`{ title }`) |
| `/api/conversations/:id` | DELETE | Delete conversation + cascade-delete its messages |
| `/api/conversations/:id/messages` | POST | Append a user message `{ content }`, call Ollama `/api/chat` with `stream: true`, stream the assistant reply back to the client, persist both messages |

## Streaming flow

1. Client POSTs `{ content }` to `/api/conversations/:id/messages`.
2. Server inserts the user message into SQLite immediately (so it's never
   lost even if the Ollama call fails).
3. Server loads the conversation's full message history + model, opens a
   streaming `fetch` to Ollama's `/api/chat` with `stream: true`.
4. Server pipes each JSON-lines chunk from Ollama straight through to the
   client as a raw streamed HTTP response (`ReadableStream` passthrough,
   `Content-Type: application/x-ndjson` or similar).
5. Client reads the stream and appends each token to the in-progress
   assistant bubble as it arrives.
6. When Ollama emits a chunk with `done: true`, the server has accumulated
   the full assistant text and writes it to SQLite as one `messages` row,
   then closes the response stream.
7. Client, on stream close, reconciles its locally-built text with the final
   persisted message (should already match) and marks the message as
   complete (stops the streaming/typing indicator).

## Frontend components

- **`Sidebar`** — conversation list (title, relative timestamp), "New chat"
  button, rename (inline edit) and delete (with confirmation) per item.
- **`ChatWindow`** — scrollable message list for the active conversation.
  Assistant messages render as Markdown (via `react-markdown` +
  `rehype-highlight`/`rehype-raw` style syntax highlighting for code
  fences); user messages render as plain text.
- **`MessageInput`** — textarea + send button. Disabled while a response is
  streaming; Enter submits, Shift+Enter inserts a newline.
- **`ModelPicker`** — dropdown populated from `/api/models`. Shown in the
  "New chat" flow before the first message is sent; once a conversation has
  messages, the model is locked and shown as a read-only badge.

## Error handling

- Ollama unreachable or model not pulled: the `/api/chat` proxy call fails;
  server surfaces the raw Ollama error message as a system-style error
  bubble in the conversation (not a silent failure, not a generic 500 with
  no detail). The user's message is already persisted, so retrying doesn't
  lose their input.
- `/api/models` failing (Ollama not running) disables the "New chat" model
  picker with an inline message ("Can't reach Ollama — is it running?").

## Testing

No test framework currently configured in this repo. Add Vitest for API
route tests:
- Conversation CRUD routes (create/list/rename/delete, cascade delete of
  messages).
- Streaming proxy logic in `/api/conversations/:id/messages`, against a
  mocked Ollama endpoint (verifying chunks are forwarded and the final
  message is persisted correctly on `done: true`).

## Out of scope (for this spec)

- Multi-user / auth.
- Editing or regenerating past messages.
- Switching a conversation's model after creation.
- Attachments/images, tool calling, or other Ollama features beyond basic
  chat completion.
