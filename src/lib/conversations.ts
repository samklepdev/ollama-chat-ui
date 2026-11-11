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
