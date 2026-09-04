import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Field =
  | "Crypto"
  | "Sports"
  | "Esports"
  | "Politics"
  | "Finance"
  | "World Events";

type Headline = {
  title: string;
  description: string;
  link: string;
  source: string;
  credibility: number;
  publishedAt: string;
  importance: number;
};

type Market = {
  id: number | string;
  title: string;
  slug: string;
  yes: number;
  no: number;
  volume: string;
  url: string;
};

type ModelAnalysis = {
  headlineIndex: number;
  marketSlug: string | null;
  marketTitle: string;
  impact: string;
  confidence: number;
  horizon: string;
  analysis: string;
};

const STOP = new Set([
  "this",
  "that",
  "with",
  "from",
  "have",
  "will",
  "after",
  "over",
  "into",
  "about",
  "against",
  "could",
  "would",
  "should",
  "their",
  "there",
  "what",
  "when",
  "your",
  "been",
  "were",
  "they",
  "them",
  "and",
  "for",
  "the",
]);

function getField(value: string | null): Field {
  const fields: Field[] = [
    "Crypto",
    "Sports",
    "Esports",
    "Politics",
    "Finance",
    "World Events",
  ];
  return fields.includes(value as Field) ? (value as Field) : "Crypto";
}

function words(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !STOP.has(word));
}

function cleanJson(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function getGeminiText(data: unknown) {
  const result = data as {
    steps?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  if (!Array.isArray(result.steps)) return "";
  return result.steps
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .join("")
    .trim();
}

function getGroqText(data: unknown) {
  const result = data as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const choice =
    Array.isArray(result.choices) && result.choices.length > 0
      ? result.choices[0]
      : undefined;
  return choice?.message?.content?.trim() ?? "";
}

function bestMarket(headline: Headline, markets: Market[]) {
  const headlineWords = words(`${headline.title} ${headline.description}`);
  let best: Market | null = null;
  let score = 0;

  for (const market of markets) {
    const title = market.title.toLowerCase();
    const next = headlineWords.filter((word) => title.includes(word)).length;
    if (next > score) {
      score = next;
      best = market;
    }
  }

  return score > 0 ? best : null;
}

function fallbackAnalyses(headlines: Headline[], markets: Market[]) {
  return headlines.map((headline, headlineIndex) => {
    const market = bestMarket(headline, markets);
    if (!market) {
      return {
        headlineIndex,
        marketSlug: null,
        marketTitle: "No clean market mapping",
        impact: "No clean market mapping",
        confidence: 1,
        horizon: "Not applicable",
        analysis:
          "This headline belongs to the selected field, but it does not map cleanly to one live Limitless market. Use it as background context only.",
      };
    }

    return {
      headlineIndex,
      marketSlug: market.slug,
      marketTitle: market.title,
      impact: "Mixed / uncertain",
      confidence: 2,
      horizon: "Hours to 1 day",
      analysis:
        "This headline shares a topic with a live Limitless market in this field. Treat it as a research lead, not a trade recommendation.",
    };
  });
}

function buildItems(
  headlines: Headline[],
  markets: Market[],
  analyses: ModelAnalysis[],
) {
  const validSlugs = new Set(markets.map((market) => market.slug));

  return headlines.slice(0, 5).map((headline, headlineIndex) => {
    const fallback = fallbackAnalyses([headline], markets)[0];

    const analysis =
      analyses.find((item) => item.headlineIndex === headlineIndex) ??
      ({
        ...fallback,
        headlineIndex,
      } satisfies ModelAnalysis);

    const market =
      analysis.marketSlug && validSlugs.has(analysis.marketSlug)
        ? markets.find((item) => item.slug === analysis.marketSlug)
        : null;

    return {
      headline,
      analysis: {
        headlineIndex,
        marketSlug: market?.slug ?? null,
        marketTitle: market?.title ?? "No clean market mapping",
        impact: market ? analysis.impact : "No clean market mapping",
        confidence: Math.max(1, Math.min(5, Number(analysis.confidence) || 1)),
        horizon: market ? analysis.horizon : "Not applicable",
        analysis: analysis.analysis,
      },
    };
  });
}

async function askGemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API key is not configured.");

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3.5-flash-lite",
        input: prompt,
      }),
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message ?? "Gemini is unavailable.");
  }
  const text = getGeminiText(data);
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

async function askGroq(prompt: string) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Groq API key is not configured.");

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        temperature: 0.1,
        max_completion_tokens: 1600,
        messages: [
          {
            role: "system",
            content:
              "You are a careful prediction-market research analyst. Return only valid JSON.",
          },
          { role: "user", content: prompt },
        ],
      }),
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message ?? "Groq is unavailable.");
  }
  const text = getGroqText(data);
  if (!text) throw new Error("Groq returned an empty response.");
  return text;
}

async function askModel(prompt: string) {
  try {
    return { provider: "Gemini", text: await askGemini(prompt) };
  } catch (geminiError) {
    console.warn("Gemini failed. Trying Groq.", geminiError);
    try {
      return { provider: "Groq GPT-OSS 120B", text: await askGroq(prompt) };
    } catch (groqError) {
      console.warn("Groq failed. Using field headlines.", groqError);
      return { provider: "Limitless market match", text: "" };
    }
  }
}

function buildPrompt(field: Field, headlines: Headline[], markets: Market[]) {
  return `
You are an English-language research analyst for Limitless prediction markets.
FIELD: ${field}
Map a headline to a market only when the connection is direct.
Never invent market slugs. marketSlug must be from ACTIVE MARKETS or null.
Do not use: buy, sell, bet, wager, guaranteed, certain.
analysis must be exactly two short sentences.
impact must be one of: Potential YES/UP support; Potential NO/DOWN support; Mixed / uncertain; No clean market mapping.
confidence integer 1 to 5.
horizon one of: Minutes to hours; Hours to 1 day; Days; Days to weeks; Not applicable.
Return only valid JSON.

HEADLINES:
${JSON.stringify(
  headlines.map((headline, headlineIndex) => ({
    headlineIndex,
    title: headline.title,
    description: headline.description,
    source: headline.source,
    credibility: headline.credibility,
    importance: headline.importance,
  })),
)}

ACTIVE MARKETS:
${JSON.stringify(
  markets.map((market) => ({
    slug: market.slug,
    title: market.title,
    yesPrice: market.yes,
    noPrice: market.no,
    volume: market.volume,
  })),
)}
`;
}

export async function GET(request: NextRequest) {
  const field = getField(request.nextUrl.searchParams.get("field"));

  try {
    const origin = request.nextUrl.origin;
    const [newsResponse, marketsResponse] = await Promise.all([
      fetch(`${origin}/api/news/latest?field=${encodeURIComponent(field)}`, {
        cache: "no-store",
      }),
      fetch(
        `${origin}/api/markets/active?field=${encodeURIComponent(field)}&limit=25`,
        { cache: "no-store" },
      ),
    ]);

    if (!newsResponse.ok || !marketsResponse.ok) {
      return NextResponse.json(
        { error: "News or Limitless markets could not be loaded." },
        { status: 502 },
      );
    }

    const newsData = await newsResponse.json();
    const marketData = await marketsResponse.json();
    const headlines: Headline[] = Array.isArray(newsData.headlines)
      ? newsData.headlines.slice(0, 8)
      : [];
    const markets: Market[] = Array.isArray(marketData.markets)
      ? marketData.markets
      : [];

    if (headlines.length === 0) {
      return NextResponse.json(
        { error: "No live headlines are available." },
        { status: 404 },
      );
    }

    const prompt = buildPrompt(field, headlines, markets);
    const model = await askModel(prompt);
    let parsedAnalyses: ModelAnalysis[] = [];

    if (model.text) {
      try {
        parsedAnalyses =
          (JSON.parse(cleanJson(model.text)) as { analyses?: ModelAnalysis[] })
            .analyses ?? [];
      } catch {
        parsedAnalyses = [];
      }
    }

    if (parsedAnalyses.length === 0) {
      parsedAnalyses = fallbackAnalyses(headlines, markets);
    }

    return NextResponse.json({
      field,
      updatedAt: new Date().toISOString(),
      provider: model.provider,
      items: buildItems(headlines, markets, parsedAnalyses),
    });
  } catch (error) {
    console.error("Analysis route error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "AI analysis is temporarily unavailable.",
      },
      { status: 500 },
    );
  }
}