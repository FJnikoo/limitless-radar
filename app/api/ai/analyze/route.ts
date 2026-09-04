import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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

type MatchScore = {
  score: number;
  sharedEntities: string[];
  sharedKeywords: string[];
};
type CachedAnalysisResponse = {
  value: {
    field: Field;
    updatedAt: string;
    provider: string;
    items: Array<{
      headline: Headline;
      analysis: ModelAnalysis;
    }>;
  };
  expiresAt: number;
};

const FIELDS: Field[] = [
  "Crypto",
  "Sports",
  "Esports",
  "Politics",
  "Finance",
  "World Events",
];
const analysisResponseCache = new Map<string, CachedAnalysisResponse>();

const ANALYSIS_CACHE_MS: Record<Field, number> = {
  Crypto: 15 * 60 * 1000,
  Finance: 15 * 60 * 1000,
  Politics: 15 * 60 * 1000,
  "World Events": 15 * 60 * 1000,
  Sports: 10 * 60 * 1000,
  Esports: 10 * 60 * 1000,
};
const ANALYSIS_REVALIDATE_SECONDS: Record<Field, number> = {
  Crypto: 15 * 60,
  Finance: 15 * 60,
  Politics: 15 * 60,
  "World Events": 15 * 60,
  Sports: 10 * 60,
  Esports: 10 * 60,
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
  "are",
  "was",
  "has",
  "had",
  "not",
  "but",
  "its",
  "our",
  "out",
  "new",
  "more",
  "than",
  "than",
  "how",
  "why",
  "who",
  "where",
  "today",
  "latest",
  "report",
  "reports",
  "reported",
  "says",
  "said",
  "amid",
  "also",
  "year",
  "month",
  "week",
  "days",
  "hours",
]);

const GENERIC_TERMS = new Set([
  "crypto",
  "cryptocurrency",
  "token",
  "tokens",
  "coin",
  "coins",
  "market",
  "markets",
  "price",
  "prices",
  "trade",
  "trading",
  "launch",
  "launches",
  "launched",
  "project",
  "projects",
  "news",
  "update",
  "updates",
  "event",
  "events",
  "world",
  "global",
  "international",
  "official",
  "future",
  "futures",
  "prediction",
  "predictions",
  "yes",
  "no",
  "up",
  "down",
  "high",
  "higher",
  "low",
  "lower",
  "rise",
  "rises",
  "rising",
  "fall",
  "falls",
  "falling",
  "jump",
  "jumps",
  "gain",
  "gains",
  "drop",
  "drops",
  "move",
  "moves",
  "change",
  "changes",
  "expected",
  "expectation",
  "possible",
  "likely",
  "may",
  "might",
  "could",
  "would",
  "should",
  "will",
  "today",
  "tomorrow",
  "week",
  "month",
  "year",
  "deadline",
  "before",
  "after",
  "by",
  "during",
  "above",
  "below",
  "under",
  "over",
  "reach",
  "reaches",
  "hit",
  "hits",
]);

const ENTITY_ALIASES: Record<string, string[]> = {
  bitcoin: ["bitcoin", "btc"],
  ethereum: ["ethereum", "eth"],
  solana: ["solana", "sol"],
  zcash: ["zcash", "zec"],
  dogecoin: ["dogecoin", "doge"],
  xrp: ["xrp", "ripple"],
  cardano: ["cardano", "ada"],
  avalanche: ["avalanche", "avax"],
  chainlink: ["chainlink", "link"],
  uniswap: ["uniswap", "uni"],
  "federal reserve": ["federal reserve", "the fed", "fed"],
  "bank of england": ["bank of england", "boe"],
  "european central bank": ["european central bank", "ecb"],
  "donald trump": ["donald trump", "trump"],
  "joe biden": ["joe biden", "biden"],
  "volodymyr zelenskyy": ["volodymyr zelenskyy", "zelenskyy"],
  "vladimir putin": ["vladimir putin", "putin"],
  "united states": ["united states", "u.s.", "us", "usa", "america"],
  "united kingdom": ["united kingdom", "u.k.", "uk", "britain", "british"],
  "european union": ["european union", "e.u.", "eu"],
  "north korea": ["north korea", "dprk"],
  "south korea": ["south korea", "rok"],
  "new york": ["new york", "nyc"],
  "los angeles": ["los angeles", "la"],
  "manchester city": ["manchester city", "man city"],
  "manchester united": ["manchester united", "man united", "man utd"],
  "real madrid": ["real madrid"],
  "barcelona": ["barcelona", "fc barcelona"],
  "team falcons": ["team falcons", "falcons"],
  "g2": ["g2", "g2 esports"],
  furia: ["furia"],
  vitality: ["vitality", "team vitality"],
  "kt rolster": ["kt rolster", "kt"],
  "dplus kia": ["dplus kia", "damwon", "dk"],
};

function removeExpiredAnalysisCache() {
  const now = Date.now();

  for (const [key, cached] of analysisResponseCache) {
    if (cached.expiresAt <= now) {
      analysisResponseCache.delete(key);
    }
  }
}

function getField(value: string | null): Field {
  return FIELDS.includes(value as Field) ? (value as Field) : "Crypto";
}

function normaliseText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenise(value: string) {
  return normaliseText(value)
    .split(" ")
    .filter(
      (word) =>
        word.length >= 3 &&
        !STOP.has(word) &&
        !GENERIC_TERMS.has(word),
    );
}

function textContainsPhrase(text: string, phrase: string) {
  const paddedText = ` ${normaliseText(text)} `;
  const paddedPhrase = ` ${normaliseText(phrase)} `;

  return paddedText.includes(paddedPhrase);
}

function extractEntities(text: string) {
  const found = new Set<string>();

  for (const [entity, aliases] of Object.entries(ENTITY_ALIASES)) {
    if (aliases.some((alias) => textContainsPhrase(text, alias))) {
      found.add(entity);
    }
  }

  return [...found];
}

function keywordSet(text: string) {
  return new Set(tokenise(text));
}

function titleText(headline: Headline) {
  return `${headline.title} ${headline.description}`;
}

function sharedValues(first: Set<string>, second: Set<string>) {
  return [...first].filter((value) => second.has(value));
}

function scoreMarketMatch(
  headline: Headline,
  market: Market,
): MatchScore {
  const headlineText = titleText(headline);
  const marketText = market.title;

  const headlineEntities = new Set(extractEntities(headlineText));
  const marketEntities = new Set(extractEntities(marketText));
  const sharedEntities = sharedValues(headlineEntities, marketEntities);

  const headlineKeywords = keywordSet(headlineText);
  const marketKeywords = keywordSet(marketText);
  const sharedKeywords = sharedValues(headlineKeywords, marketKeywords);

  const marketTitleTokens = tokenise(market.title);
  const marketEntityTokenCount = marketTitleTokens.filter(
    (token) => !GENERIC_TERMS.has(token),
  ).length;

  let score = 0;

  // Named entities are much stronger evidence than generic word overlap.
  score += sharedEntities.length * 8;

  // Two specific shared keywords can support a mapping when aliases are absent.
  score += Math.min(sharedKeywords.length, 4) * 2;

  // Exact multi-word phrases deserve a small additional boost.
  for (const entity of sharedEntities) {
    if (textContainsPhrase(headlineText, entity)) {
      score += 2;
    }
  }

  // A very short/generic market title is unsafe unless an entity matches.
  if (marketEntityTokenCount < 2 && sharedEntities.length === 0) {
    score -= 3;
  }

  return {
    score,
    sharedEntities,
    sharedKeywords,
  };
}

function isCleanMarketMatch(
  headline: Headline,
  market: Market,
) {
  const match = scoreMarketMatch(headline, market);

  // Primary path: a shared named entity is required.
  if (match.sharedEntities.length >= 1 && match.score >= 8) {
    return true;
  }

  // Secondary path: when entity aliases do not cover a proper noun,
  // require three non-generic shared keywords rather than one loose overlap.
  if (
    match.sharedEntities.length === 0 &&
    match.sharedKeywords.length >= 3 &&
    match.score >= 6
  ) {
    return true;
  }

  return false;
}

function bestMarket(headline: Headline, markets: Market[]) {
  const candidates = markets
    .map((market) => ({
      market,
      match: scoreMarketMatch(headline, market),
    }))
    .filter(({ market }) => isCleanMarketMatch(headline, market))
    .sort((a, b) => {
      if (b.match.score !== a.match.score) {
        return b.match.score - a.match.score;
      }

      return Number(b.market.volume) - Number(a.market.volume);
    });

  return candidates[0]?.market ?? null;
}

function noMappingAnalysis(headlineIndex: number): ModelAnalysis {
  return {
    headlineIndex,
    marketSlug: null,
    marketTitle: "No clean market mapping",
    impact: "No clean market mapping",
    confidence: 1,
    horizon: "Not applicable",
    analysis:
      "This headline does not have a sufficiently direct connection to an active Limitless market in the selected field. Use it as background research only.",
  };
}

function fallbackAnalyses(headlines: Headline[], markets: Market[]) {
  return headlines.map((headline, headlineIndex) => {
    const market = bestMarket(headline, markets);

    if (!market) {
      return noMappingAnalysis(headlineIndex);
    }

    return {
      headlineIndex,
      marketSlug: market.slug,
      marketTitle: market.title,
      impact: "Mixed / uncertain",
      confidence: 2,
      horizon: "Hours to 1 day",
      analysis:
        "This headline has a direct topic overlap with the selected active Limitless market. Treat the connection as research context, not a trade recommendation.",
    };
  });
}

function sanitiseAnalysisText(value: unknown) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "No additional model analysis is available for this market mapping.";
  }

  return text.slice(0, 900);
}

function sanitiseImpact(value: unknown) {
  const allowed = new Set([
    "Potential YES/UP support",
    "Potential NO/DOWN support",
    "Mixed / uncertain",
    "No clean market mapping",
  ]);

  const impact = String(value ?? "").trim();

  return allowed.has(impact) ? impact : "Mixed / uncertain";
}

function sanitiseHorizon(value: unknown) {
  const allowed = new Set([
    "Minutes to hours",
    "Hours to 1 day",
    "Days",
    "Days to weeks",
    "Not applicable",
  ]);

  const horizon = String(value ?? "").trim();

  return allowed.has(horizon) ? horizon : "Hours to 1 day";
}

function modelAnalysisForHeadline(
  headlineIndex: number,
  analyses: ModelAnalysis[],
) {
  return analyses.find(
    (item) =>
      Number.isInteger(item.headlineIndex) &&
      item.headlineIndex === headlineIndex,
  );
}

function buildItems(
  headlines: Headline[],
  markets: Market[],
  analyses: ModelAnalysis[],
) {
  const marketsBySlug = new Map(
    markets.map((market) => [market.slug, market]),
  );

  return headlines.slice(0, 5).map((headline, headlineIndex) => {
    const modelAnalysis = modelAnalysisForHeadline(headlineIndex, analyses);
    const proposedMarket =
      modelAnalysis?.marketSlug
        ? marketsBySlug.get(modelAnalysis.marketSlug)
        : null;

    // The backend, not the model, makes the final decision on relevance.
    const market =
      proposedMarket && isCleanMarketMatch(headline, proposedMarket)
        ? proposedMarket
        : bestMarket(headline, markets);

    if (!market) {
      const fallback = noMappingAnalysis(headlineIndex);

      return {
        headline,
        analysis: fallback,
      };
    }

    const useModelText =
      proposedMarket?.slug === market.slug &&
      modelAnalysis &&
      isCleanMarketMatch(headline, market);

    return {
      headline,
      analysis: {
        headlineIndex,
        marketSlug: market.slug,
        marketTitle: market.title,
        impact: useModelText
          ? sanitiseImpact(modelAnalysis.impact)
          : "Mixed / uncertain",
        confidence: useModelText
          ? Math.max(
              1,
              Math.min(5, Math.round(Number(modelAnalysis.confidence) || 2)),
            )
          : 2,
        horizon: useModelText
          ? sanitiseHorizon(modelAnalysis.horizon)
          : "Hours to 1 day",
        analysis: useModelText
          ? sanitiseAnalysisText(modelAnalysis.analysis)
          : "This headline has a direct topic overlap with the selected active Limitless market. Treat the connection as research context, not a trade recommendation.",
      },
    };
  });
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
        max_completion_tokens: 1600,
        messages: [
          {
            role: "system",
            content:
              "You are a careful prediction-market research analyst. Return only valid JSON.",
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
    console.warn("Gemini failed. Trying Groq.", geminiError);

    try {
      return {
        provider: "Groq GPT-OSS 120B",
        text: await askGroq(prompt),
      };
    } catch (groqError) {
      console.warn("Groq failed. Using deterministic mapping.", groqError);

      return {
        provider: "Strict deterministic market match",
        text: "",
      };
    }
  }
}

function buildPrompt(field: Field, headlines: Headline[], markets: Market[]) {
  return `
You are an English-language research analyst for Limitless prediction markets.

FIELD: ${field}

Your job is to connect each headline only to an ACTIVE MARKET with a direct and defensible relationship.

Strict market-mapping rules:
- A shared general field is never enough. For example, a Bitcoin headline must not map to an unrelated token-launch market.
- Prefer the same named entity: asset, company, person, country, team, player, tournament, election, institution, or policy.
- A direct causal connection is required. If a market is only loosely related, set marketSlug to null.
- Never invent a market slug. marketSlug must exactly match one from ACTIVE MARKETS or be null.
- If uncertain, return null. Fewer mappings are better than incorrect mappings.
- Do not make a prediction or recommend buying, selling, trading, betting, or wagering.
- Do not use: buy, sell, bet, wager, guaranteed, certain.

Return ONLY valid JSON using exactly this schema:
{
  "analyses": [
    {
      "headlineIndex": 0,
      "marketSlug": "active-market-slug or null",
      "marketTitle": "active market title or No clean market mapping",
      "impact": "Potential YES/UP support | Potential NO/DOWN support | Mixed / uncertain | No clean market mapping",
      "confidence": 1,
      "horizon": "Minutes to hours | Hours to 1 day | Days | Days to weeks | Not applicable",
      "analysis": "Exactly two short neutral sentences."
    }
  ]
}

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
  removeExpiredAnalysisCache();

const cached = analysisResponseCache.get(field);

if (cached && cached.expiresAt > Date.now()) {
  return NextResponse.json({
    ...cached.value,
    cached: true,
    expiresAt: new Date(cached.expiresAt).toISOString(),
  });
}

  try {
    const origin = request.nextUrl.origin;

    const [newsResponse, marketsResponse] = await Promise.all([
      fetch(`${origin}/api/news/latest?field=${encodeURIComponent(field)}`, {
        cache: "no-store",
      }),
      fetch(
        `${origin}/api/markets/active?field=${encodeURIComponent(field)}&limit=25`,
        {
          cache: "no-store",
        },
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
        const parsed = JSON.parse(cleanJson(model.text)) as {
          analyses?: unknown;
        };

        parsedAnalyses = Array.isArray(parsed.analyses)
          ? (parsed.analyses as ModelAnalysis[])
          : [];
      } catch {
        parsedAnalyses = [];
      }
    }

    const value = {
  field,
  updatedAt: new Date().toISOString(),
  provider: model.provider,
  items: buildItems(headlines, markets, parsedAnalyses),
};

const expiresAt = Date.now() + ANALYSIS_CACHE_MS[field];

analysisResponseCache.set(field, {
  value,
  expiresAt,
});

return NextResponse.json({
  ...value,
  cached: false,
  expiresAt: new Date(expiresAt).toISOString(),
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