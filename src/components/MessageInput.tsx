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
