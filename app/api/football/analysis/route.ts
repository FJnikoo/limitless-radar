import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Outcome = {
  name: string;
  price: number;
  lastPrice?: number;
  volume?: string;
  slug?: string;
};

type FootballForm = {
  teamName: string | null;
  results: ("W" | "D" | "L")[];
  wins: number;
  draws: number;
  losses: number;
};

type FootballHistoryMatch = {
  fixtureId: number | null;
  dateUtc: string | null;
  leagueName: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
};

type FootballResearch = {
  eventId: string;
  competition: string | null;
  country: string | null;
  round: string | null;
  kickoff: string | null;
  status: string | null;
  venue: string | null;
  referee: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeForm: FootballForm;
  awayForm: FootballForm;
  headToHead: FootballHistoryMatch[];
  source?: string;
};

type FootballAnalysis = {
  summary: string;
  marketContext: string;
  formContext: string;
  headToHeadContext: string;
  caveats: string;
};

type CachedAnalysis = {
  value: FootballAnalysis;
  provider: string;
  generatedAt: string;
  expiresAt: number;
};

const analysisCache = new Map<string, CachedAnalysis>();
const FALLBACK_PROVIDER = "Deterministic Limitless summary";

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

  if (!Array.isArray(result.steps)) {
    return "";
  }

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

  return result.choices?.[0]?.message?.content?.trim() ?? "";
}

function formatPrice(price: number) {
  const cents = price * 100;

  return `${cents.toFixed(cents % 1 === 0 ? 0 : 1)}¢`;
}

function roundedPrice(price: number) {
  return Number(price).toFixed(2);
}

function safeText(value: unknown, fallback = "Unavailable") {
  const text = String(value ?? "").trim();

  return text || fallback;
}

function compactForm(form: FootballForm) {
  const results = Array.isArray(form.results) ? form.results.join(" · ") : "";

  return {
    team: safeText(form.teamName, "Team"),
    results: results || "No completed recent results returned",
    record: `${Number(form.wins) || 0}W · ${Number(form.draws) || 0}D · ${
      Number(form.losses) || 0
    }L`,
  };
}

function compactHeadToHead(matches: FootballHistoryMatch[]) {
  return matches.slice(0, 5).map((match) => ({
    date: match.dateUtc ?? null,
    competition: match.leagueName ?? null,
    result: `${safeText(match.homeTeam, "Home")} ${
      match.homeGoals ?? "–"
    }–${match.awayGoals ?? "–"} ${safeText(match.awayTeam, "Away")}`,
  }));
}

function isFootballResearch(value: unknown): value is FootballResearch {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<FootballResearch>;

  return (
    typeof item.eventId === "string" &&
    !!item.homeForm &&
    !!item.awayForm &&
    Array.isArray(item.headToHead)
  );
}

function isOutcome(value: unknown): value is Outcome {
  if (!value || typeof value !== "object") {
    return false;
  }

  const outcome = value as Partial<Outcome>;

  return (
    typeof outcome.name === "string" &&
    typeof outcome.price === "number" &&
    Number.isFinite(outcome.price)
  );
}

function normaliseAnalysis(value: unknown): FootballAnalysis | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<FootballAnalysis>;

  const summary = safeText(item.summary, "");
  const marketContext = safeText(item.marketContext, "");
  const formContext = safeText(item.formContext, "");
  const headToHeadContext = safeText(item.headToHeadContext, "");
  const caveats = safeText(item.caveats, "");

  if (
    !summary ||
    !marketContext ||
    !formContext ||
    !headToHeadContext ||
    !caveats
  ) {
    return null;
  }

  return {
    summary,
    marketContext,
    formContext,
    headToHeadContext,
    caveats,
  };
}

function fallbackAnalysis(
  outcomes: Outcome[],
  research: FootballResearch,
): FootballAnalysis {
  const rankedOutcomes = [...outcomes].sort((a, b) => b.price - a.price);
  const leading = rankedOutcomes[0];
  const second = rankedOutcomes[1];
  const home = compactForm(research.homeForm);
  const away = compactForm(research.awayForm);
  const h2h = compactHeadToHead(research.headToHead);

  const marketContext =
    leading && second
      ? `${leading.name} has the highest current Limitless price at ${formatPrice(
          leading.price,
        )}, followed by ${second.name} at ${formatPrice(second.price)}.`
      : "Current Limitless outcome prices are available above.";

  const recentFormComparison =
    research.homeForm.wins > research.awayForm.wins
      ? `${home.team} has more wins in the displayed five-match sample.`
      : research.homeForm.wins < research.awayForm.wins
        ? `${away.team} has more wins in the displayed five-match sample.`
        : "The teams have the same number of wins in the displayed five-match sample.";

  const h2hContext =
    h2h.length > 0
      ? `The displayed head-to-head sample contains ${h2h.length} completed match${
          h2h.length === 1 ? "" : "es"
        }; it is historical context rather than a forecast.`
      : "No completed head-to-head results were supplied in the current Limitless event data.";

  return {
    summary: `${marketContext} The football context below should be read alongside the current market snapshot.`,
    marketContext,
    formContext: `${home.team}: ${home.results} (${home.record}). ${away.team}: ${away.results} (${away.record}). ${recentFormComparison}`,
    headToHeadContext: h2hContext,
    caveats:
      "This is research context only. Starting line-ups, injuries, late news, match conditions, and changing Limitless prices may affect the situation.",
  };
}

function buildAnalysisPrompt(
  outcomes: Outcome[],
  research: FootballResearch,
) {
  const rankedOutcomes = [...outcomes]
    .sort((a, b) => b.price - a.price)
    .map((outcome) => ({
      name: outcome.name,
      price: formatPrice(outcome.price),
      lastPrice:
        typeof outcome.lastPrice === "number"
          ? formatPrice(outcome.lastPrice)
          : null,
      volume: outcome.volume ?? null,
    }));

  const home = compactForm(research.homeForm);
  const away = compactForm(research.awayForm);

  return `
You are an English-language football research analyst for a prediction-market dashboard.

Use ONLY the provided LIMITLESS DATA. Do not introduce any facts not present in the input.
Do not mention injuries, line-ups, tactics, news, weather, motivation, odds outside the data, or historical claims not provided.
Do not make a prediction and do not recommend buying, selling, trading, betting, or wagering.
Do not use words such as: buy, sell, bet, wager, guaranteed, certain, lock, sure thing.
Treat all market prices as a current market snapshot, not a probability forecast or recommendation.

Return ONLY valid JSON, with exactly this schema:
{
  "summary": "1-2 short neutral sentences.",
  "marketContext": "1 short neutral sentence about current Limitless price ordering.",
  "formContext": "1-2 short sentences comparing only the supplied five-match form.",
  "headToHeadContext": "1 short sentence describing only the supplied head-to-head sample.",
  "caveats": "1 short sentence stating context limitations."
}

LIMITLESS EVENT DATA:
${JSON.stringify(
  {
    eventId: research.eventId,
    competition: research.competition,
    country: research.country,
    round: research.round,
    status: research.status,
    venue: research.venue,
    referee: research.referee,
    homeTeam: research.homeTeam,
    awayTeam: research.awayTeam,
    homeRecentForm: home,
    awayRecentForm: away,
    headToHead: compactHeadToHead(research.headToHead),
    currentMarketOutcomes: rankedOutcomes,
  },
  null,
  2,
)}
`;
}

async function askGemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error("Gemini API key is not configured.");
  }

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

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

async function askGroq(prompt: string) {
  const key = process.env.GROQ_API_KEY;

  if (!key) {
    throw new Error("Groq API key is not configured.");
  }

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
        max_completion_tokens: 700,
        messages: [
          {
            role: "system",
            content:
              "You are a careful football research analyst. Return only valid JSON and use only the user's supplied data.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? "Groq is unavailable.");
  }

  const text = getGroqText(data);

  if (!text) {
    throw new Error("Groq returned an empty response.");
  }

  return text;
}

async function askModel(prompt: string) {
  try {
    return {
      provider: "Gemini",
      text: await askGemini(prompt),
    };
  } catch (geminiError) {
    console.warn("Football analysis Gemini failed. Trying Groq.", geminiError);

    try {
      return {
        provider: "Groq GPT-OSS 120B",
        text: await askGroq(prompt),
      };
    } catch (groqError) {
      console.warn(
        "Football analysis Groq failed. Using deterministic fallback.",
        groqError,
      );

      return {
        provider: FALLBACK_PROVIDER,
        text: "",
      };
    }
  }
}

function cacheTtlMs(status: string | null) {
  const normalisedStatus = String(status ?? "").toLowerCase();

  if (
    normalisedStatus.includes("live") ||
    normalisedStatus.includes("in play") ||
    normalisedStatus.includes("first half") ||
    normalisedStatus.includes("second half") ||
    normalisedStatus.includes("halftime")
  ) {
    return 5 * 60 * 1000;
  }

  if (
    normalisedStatus.includes("finished") ||
    normalisedStatus.includes("full time") ||
    normalisedStatus.includes("match finished") ||
    normalisedStatus.includes("after extra time") ||
    normalisedStatus.includes("penalty")
  ) {
    return 6 * 60 * 60 * 1000;
  }

  return 30 * 60 * 1000;
}

function cacheKey(outcomes: Outcome[], research: FootballResearch) {
  const outcomeSignature = [...outcomes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((outcome) =>
      [
        outcome.name,
        roundedPrice(outcome.price),
        roundedPrice(outcome.lastPrice ?? 0),
      ].join(":"),
    )
    .join("|");

  const formSignature = [
    research.eventId,
    research.status ?? "",
    research.homeForm.results.join(""),
    research.awayForm.results.join(""),
    research.headToHead
      .slice(0, 5)
      .map((match) =>
        [
          match.fixtureId ?? "",
          match.homeGoals ?? "",
          match.awayGoals ?? "",
        ].join(":"),
      )
      .join("|"),
  ].join("|");

  return `football-analysis:${formSignature}:${outcomeSignature}`;
}

function removeExpiredCache() {
  const now = Date.now();

  for (const [key, item] of analysisCache) {
    if (item.expiresAt <= now) {
      analysisCache.delete(key);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const outcomes = Array.isArray(body?.outcomes)
      ? body.outcomes.filter(isOutcome)
      : [];
    const research = body?.footballResearch;

    if (!isFootballResearch(research)) {
      return NextResponse.json(
        { error: "Valid footballResearch is required." },
        { status: 400 },
      );
    }

    if (outcomes.length < 2) {
      return NextResponse.json(
        { error: "At least two valid market outcomes are required." },
        { status: 400 },
      );
    }

    removeExpiredCache();

    const key = cacheKey(outcomes, research);
    const cached = analysisCache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({
        analysis: cached.value,
        provider: cached.provider,
        cached: true,
        generatedAt: cached.generatedAt,
        expiresAt: new Date(cached.expiresAt).toISOString(),
      });
    }

    const prompt = buildAnalysisPrompt(outcomes, research);
    const model = await askModel(prompt);

    let analysis: FootballAnalysis | null = null;
    let provider = model.provider;

    if (model.text) {
      try {
        analysis = normaliseAnalysis(JSON.parse(cleanJson(model.text)));
      } catch {
        analysis = null;
      }
    }

    if (!analysis) {
      analysis = fallbackAnalysis(outcomes, research);
      provider = FALLBACK_PROVIDER;
    }

    const generatedAt = new Date().toISOString();
    const expiresAt = Date.now() + cacheTtlMs(research.status);

    analysisCache.set(key, {
      value: analysis,
      provider,
      generatedAt,
      expiresAt,
    });

    return NextResponse.json({
      analysis,
      provider,
      cached: false,
      generatedAt,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error) {
    console.error("Football analysis route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Football analysis is temporarily unavailable.",
      },
      { status: 500 },
    );
  }
}