import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "GROQ_API_KEY was not found. Check .env.local, then restart npm run dev.",
      },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          temperature: 0,
          max_completion_tokens: 50,
          messages: [
            {
              role: "system",
              content:
                "Reply with exactly this sentence and nothing else: Groq connection successful.",
            },
            {
              role: "user",
              content: "Test the connection.",
            },
          ],
        }),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: response.status,
          groqError: result?.error?.message ?? "Unknown Groq error",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        result.choices?.[0]?.message?.content ??
        "Groq connection succeeded.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to connect to Groq right now.",
      },
      { status: 500 },
    );
  }
}