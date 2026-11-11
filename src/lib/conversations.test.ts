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
