"use client";

import { useEffect, useRef } from "react";
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

const NEAR_BOTTOM_THRESHOLD_PX = 80;

export function ChatWindow({ messages, isStreaming, error }: ChatWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  function handleScroll() {
    const el = windowRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX;
  }

  useEffect(() => {
    const el = windowRef.current;
    if (!el || !isNearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, error]);

  return (
    <div className={styles.window} ref={windowRef} onScroll={handleScroll}>
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
