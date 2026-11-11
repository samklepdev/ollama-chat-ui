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
