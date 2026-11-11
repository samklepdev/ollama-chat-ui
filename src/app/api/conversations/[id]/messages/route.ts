import { NextRequest, NextResponse } from "next/server";
import {
  addMessage,
  getConversation,
  listMessages,
  touchConversation,
} from "@/lib/conversations";
import { getDb } from "@/lib/db";
import { chatStream, parseNdjsonLine } from "@/lib/ollama";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const db = getDb();
  const conversation = getConversation(db, id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  addMessage(db, id, "user", content);
  const history = listMessages(db, id);

  let ollamaResponse: Response;
  try {
    ollamaResponse = await chatStream(
      conversation.model,
      history.map(({ role, content: messageContent }) => ({ role, content: messageContent }))
    );
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach Ollama: ${(error as Error).message}` },
      { status: 502 }
    );
  }

  if (!ollamaResponse.ok || !ollamaResponse.body) {
    const detail = await ollamaResponse.text().catch(() => "");
    return NextResponse.json(
      { error: `Ollama error (${ollamaResponse.status}): ${detail}` },
      { status: 502 }
    );
  }

  const reader = ollamaResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantContent = "";

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) {
          const chunk = parseNdjsonLine(buffer);
          if (chunk) assistantContent += chunk.content;
        }
        addMessage(db, id, "assistant", assistantContent);
        touchConversation(db, id);
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const chunk = parseNdjsonLine(line);
        if (chunk) assistantContent += chunk.content;
      }
      controller.enqueue(value);
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
