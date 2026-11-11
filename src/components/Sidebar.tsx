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
