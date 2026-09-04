import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "GEMINI_API_KEY was not found. Check .env.local, then restart npm run dev.",
      },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-3.5-flash-lite",
          input: "Reply with exactly: Gemini connection successful.",
        }),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: response.status,
          geminiError:
            result?.error?.message ?? "Unknown Gemini API error",
        },
        { status: 502 },
      );
    }

    const text = Array.isArray(result.steps)
      ? result.steps
          .filter((step: { type?: string }) => step.type === "model_output")
          .flatMap((step: { content?: Array<{ type?: string; text?: string }> }) =>
            step.content ?? [],
          )
          .filter((content: { type?: string }) => content.type === "text")
          .map((content: { text?: string }) => content.text ?? "")
          .join("")
      : "";

    return NextResponse.json({
      ok: true,
      message: text || "Gemini connection succeeded.",
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to connect to Gemini right now.",
      },
      { status: 500 },
    );
  }
}