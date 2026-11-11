"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";
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
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeHighlight, rehypeKatex]}
            >
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
