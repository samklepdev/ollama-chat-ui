import { NextResponse } from "next/server";
import { listModels } from "@/lib/ollama";

export async function GET() {
  try {
    const models = await listModels();
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach Ollama: ${(error as Error).message}` },
      { status: 502 }
    );
  }
}
