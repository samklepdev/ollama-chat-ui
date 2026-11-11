import { NextRequest, NextResponse } from "next/server";
import {
  deleteConversation,
  getConversation,
  listMessages,
  renameConversation,
} from "@/lib/conversations";
import { getDb } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getDb();
  const conversation = getConversation(db, id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return NextResponse.json({ conversation, messages: listMessages(db, id) });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const updated = renameConversation(getDb(), id, title);
  if (!updated) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const deleted = deleteConversation(getDb(), id);
  if (!deleted) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
