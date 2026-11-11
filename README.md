# Ollama Chat UI

A single-user web chat UI for talking to locally-running [Ollama](https://ollama.com) models.
Pick an installed model, chat with it, and keep a history of past conversations across reloads.

## Features

- **Model picker** — lists whatever models you have installed locally via `ollama pull`.
- **Multiple conversations** — a sidebar to start, rename, and delete chats, each pinned to the
  model it was created with.
- **Streaming responses** — replies render token-by-token as the model generates them.
- **Markdown rendering** — headings, lists, tables, syntax-highlighted code blocks, and LaTeX
  math (`$...$` / `$$...$$`) in assistant replies.
- **Persistence** — conversations and messages are saved to a local SQLite file and survive
  reloads.
- **No auth, no cloud** — everything runs on your machine against your local Ollama server.

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Ollama](https://ollama.com) installed and running locally, with at least one model pulled:

  ```bash
  ollama serve
  ollama pull llama3
  ```

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (Next.js will pick the next free port if
3000 is taken — check the terminal output). Choose a model to start your first chat.

By default the app talks to Ollama at `http://localhost:11434`. If your Ollama server runs
elsewhere, set `OLLAMA_BASE_URL` (e.g. in `.env.local`):

```
OLLAMA_BASE_URL=http://localhost:11434
```

## Scripts

| Command         | Description                      |
| --------------- | -------------------------------- |
| `npm run dev`   | Start the dev server (Turbopack) |
| `npm run build` | Production build                 |
| `npm run start` | Run the production build         |
| `npm run lint`  | Lint with ESLint                 |
| `npm run test`  | Run the Vitest test suite        |

## How it works

- **Frontend**: Next.js App Router + React, CSS Modules for styling.
- **Backend**: Next.js API routes (`src/app/api/**`) proxy every call to Ollama — the browser
  never talks to Ollama directly. The chat endpoint streams Ollama's response straight through
  to the client while persisting the completed reply once it finishes.
- **Persistence**: SQLite via `better-sqlite3` (`local.db`, created automatically on first run),
  with a `conversations` and `messages` table — no ORM.
- **Markdown**: `react-markdown` with `remark-gfm`, `rehype-highlight` (code highlighting), and
  `remark-math` / `rehype-katex` (LaTeX).

`local.db` is gitignored — your chat history stays local and isn't checked into version control.

## Project docs

Design spec and implementation plan for how this was built live under
`docs/superpowers/specs/` and `docs/superpowers/plans/`.
