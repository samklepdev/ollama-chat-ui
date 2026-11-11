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
