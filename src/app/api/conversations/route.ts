import { NextRequest, NextResponse } from "next/server";
import { createConversation, listConversations } from "@/lib/conversations";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  return NextResponse.json(listConversations(db));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  if (!model) {
    return NextResponse.json({ error: "model is required" }, { status: 400 });
  }

  const db = getDb();
  const conversation = createConversation(db, model);
  return NextResponse.json(conversation, { status: 201 });
}
