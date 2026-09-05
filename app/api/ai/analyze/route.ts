import { NextRequest, NextResponse } from "next/server";
import { aiRateLimit, clientIp, redis } from "@/lib/redis";
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
  categories?: string[];
  tags?: string[];
  properties?: string[];
  automationType?: string;
  expirationDate?: string;
  outcomes?: Array<{ name: string }>;
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


type MarketTopic =
  | "price"
  | "reserve-policy"
  | "regulation"
  | "etf"
  | "macro"
  | "match"
  | "election"
  | "war-conflict"
  | "corporate"
  | "other";

const FIELDS: Field[] = [
  "Crypto",
  "Sports",
  "Esports",
  "Politics",
  "Finance",
  "World Events",
];


const ANALYSIS_CACHE_MS: Record<Field, number> = {
  Crypto: 15 * 60 * 1000,
  Finance: 15 * 60 * 1000,
  Politics: 15 * 60 * 1000,
  "World Events": 15 * 60 * 1000,
  Sports: 10 * 60 * 1000,
  Esports: 10 * 60 * 1000,
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
  barcelona: ["barcelona", "fc barcelona"],
  "team falcons": ["team falcons", "falcons"],
  g2: ["g2", "g2 esports"],
  furia: ["furia"],
  vitality: ["vitality", "team vitality"],
  "kt rolster": ["kt rolster", "kt"],
  "dplus kia": ["dplus kia", "damwon", "dk"],
};


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

function textContainsPhrase(text: string, phrase: string) {
  const paddedText = ` ${normaliseText(text)} `;
  const paddedPhrase = ` ${normaliseText(phrase)} `;

  return paddedText.includes(paddedPhrase);
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

function extractEntities(text: string) {
  const found = new Set<string>();

  for (const [entity, aliases] of Object.entries(ENTITY_ALIASES)) {
    if (aliases.some((alias) => textContainsPhrase(text, alias))) {
      found.add(entity);
    }
  }

  return [...found];
}

function sharedValues(first: Set<string>, second: Set<string>) {
  return [...first].filter((value) => second.has(value));
}

function headlineText(headline: Headline) {
  return `${headline.title} ${headline.description}`;
}

function marketText(market: Market) {
  return [
    market.title,
    ...(market.categories ?? []),
    ...(market.tags ?? []),
    ...(market.properties ?? []),
    market.automationType ?? "",
    ...(market.outcomes ?? []).map((outcome) => outcome.name),
  ].join(" ");
}

function topicOf(text: string, field: Field): MarketTopic {
  const value = normaliseText(text);

  if (
    /\b(reserve|strategic reserve|national reserve|treasury reserve|bitcoin reserve)\b/.test(
      value,
    )
  ) {
    return "reserve-policy";
  }

  if (
    /\b(sec|regulation|regulator|regulated|law|bill|legislation|congress|executive order|ban|legal|lawsuit)\b/.test(
      value,
    )
  ) {
    return "regulation";
  }

  if (/\b(etf|exchange traded fund|spot etf)\b/.test(value)) {
    return "etf";
  }

  if (
    /\b(nfp|nonfarm|payroll|jobs|employment|unemployment|cpi|inflation|gdp|interest rate|rate cut|rate hike|federal reserve|the fed|fed meeting)\b/.test(
      value,
    )
  ) {
    return "macro";
  }

  if (
    /\b(vs|versus|fixture|match|game|series|best of|bo1|bo2|bo3|bo5)\b/.test(
      value,
    )
  ) {
    return "match";
  }

  if (/\b(election|elected|vote|poll|ballot|primary|nominee)\b/.test(value)) {
    return "election";
  }

  if (
    /\b(war|ceasefire|invasion|missile|strike|conflict|sanctions|nato)\b/.test(
      value,
    )
  ) {
    return "war-conflict";
  }

  if (
    /\b(earnings|revenue|profit|shares|stock|company|ceo|merger|acquisition|ipo)\b/.test(
      value,
    )
  ) {
    return "corporate";
  }

  if (field === "Crypto") {
  const hasCryptoAsset =
    /\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|crypto)\b/.test(value);

  const hasDirectionalMarketLanguage =
    /\b(up|down|daily|weekly|monthly|close|closing|above|below|over|under|at|price|value|reach|reaches|hit|hits|clears|rally|rebound|rebounds|selloff|surge|falls|drops|gains|losses)\b/.test(
      value,
    );

  if (hasCryptoAsset && hasDirectionalMarketLanguage) {
    return "price";
  }
}

  return "other";
}

function topicsAreCompatible(
  headlineTopic: MarketTopic,
  marketTopic: MarketTopic,
) {
  if (headlineTopic === "other" || marketTopic === "other") {
    return false;
  }

  return headlineTopic === marketTopic;
}

function hasPriceLanguage(text: string) {
  return /\b(price|above|below|at|reach|reaches|hit|hits|clears|rally|selloff|surge|falls|drops|value)\b/i.test(
    text,
  );
}

function isCleanMarketMatch(headline: Headline, market: Market, field: Field) {
  const headlineValue = headlineText(headline);
  const marketValue = marketText(market);

  const headlineEntities = new Set(extractEntities(headlineValue));
  const marketEntities = new Set(extractEntities(marketValue));
  const sharedEntities = sharedValues(headlineEntities, marketEntities);

  const headlineTopic = topicOf(headlineValue, field);
  const marketTopic = topicOf(marketValue, field);

  const headlineTokens = new Set(tokenise(headlineValue));
  const marketTokens = new Set(tokenise(marketValue));
  const sharedKeywords = sharedValues(headlineTokens, marketTokens);

  if (field === "Sports" || field === "Esports") {
    return (
      sharedEntities.length >= 2 ||
      (headlineTopic === "match" &&
        marketTopic === "match" &&
        sharedEntities.length >= 1 &&
        sharedKeywords.length >= 2)
    );
  }

  if (field === "Crypto") {
  // A Crypto mapping needs both the same asset and the same market/event type.
  // Bitcoin price news can map to BTC daily/price markets, but never to BTC reserve policy.
  if (sharedEntities.length === 0) {
    return false;
  }

  return topicsAreCompatible(headlineTopic, marketTopic);
}

  if (field === "Finance") {
    return (
      sharedEntities.length >= 1 &&
      topicsAreCompatible(headlineTopic, marketTopic)
    );
  }

  if (field === "Politics" || field === "World Events") {
    return (
      sharedEntities.length >= 1 &&
      topicsAreCompatible(headlineTopic, marketTopic)
    );
  }

  return false;
}

function matchScore(headline: Headline, market: Market, field: Field) {
  const headlineValue = headlineText(headline);
  const marketValue = marketText(market);
  const sharedEntities = sharedValues(
    new Set(extractEntities(headlineValue)),
    new Set(extractEntities(marketValue)),
  );
  const sharedKeywords = sharedValues(
    new Set(tokenise(headlineValue)),
    new Set(tokenise(marketValue)),
  );
  const topicsMatch = topicsAreCompatible(
    topicOf(headlineValue, field),
    topicOf(marketValue, field),
  );

  return (
    sharedEntities.length * 20 +
    Math.min(sharedKeywords.length, 5) * 3 +
    (topicsMatch ? 20 : 0)
  );
}

function bestMarket(headline: Headline, markets: Market[], field: Field) {
  const matches = markets
    .filter((market) => isCleanMarketMatch(headline, market, field))
    .map((market) => ({
      market,
      score: matchScore(headline, market, field),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(b.market.volume) - Number(a.market.volume);
    });

  return matches[0]?.market ?? null;
}

function noMappingAnalysis(headlineIndex: number): ModelAnalysis {
  return {
    headlineIndex,
    marketSlug: null,
    marketTitle: "No directly relevant active Limitless market found",
    impact: "No clean market mapping",
    confidence: 1,
    horizon: "Not applicable",
    analysis:
      "This headline does not have a sufficiently direct connection to an active Limitless market in the selected field. It is shown as background research only.",
  };
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
  field: Field,
) {
  const marketsBySlug = new Map(
    markets.map((market) => [market.slug, market]),
  );

  return headlines.slice(0, 5).map((headline, headlineIndex) => {
    const modelAnalysis = modelAnalysisForHeadline(headlineIndex, analyses);
    const proposedMarket = modelAnalysis?.marketSlug
      ? marketsBySlug.get(modelAnalysis.marketSlug)
      : null;

    const market =
      proposedMarket &&
      isCleanMarketMatch(headline, proposedMarket, field)
        ? proposedMarket
        : bestMarket(headline, markets, field);

    if (!market) {
      return {
        headline,
        analysis: noMappingAnalysis(headlineIndex),
      };
    }

    const useModelText =
      proposedMarket?.slug === market.slug &&
      modelAnalysis &&
      isCleanMarketMatch(headline, market, field);

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

  return result.choices?.[0]?.message?.content?.trim() ?? "";
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
      return {
        provider: "Groq GPT-OSS 120B",
        text: await askGroq(prompt),
      };
    } catch (groqError) {
      console.warn("Groq failed. Using strict deterministic mapping.", groqError);
      return { provider: "Strict deterministic market match", text: "" };
    }
  }
}

function buildPrompt(field: Field, headlines: Headline[], markets: Market[]) {
  return `
You are an English-language research analyst for Limitless prediction markets.

FIELD: ${field}

Map each headline only to an ACTIVE MARKET with a direct, specific and defensible relationship.

Non-negotiable rules:
- A shared general entity is never enough. Bitcoin price news must NOT map to a Bitcoin reserve-policy market.
- Match both the named entity and event type. Examples:
  - Bitcoin price move -> only Bitcoin price-level/direction markets.
  - Bitcoin reserve policy -> only reserve, government-policy, legislation or executive-order markets.
  - NFP/CPI/Fed news -> only NFP/CPI/Fed/rates markets.
  - Sports or Esports news -> only the same fixture, teams, player, or tournament.
- If no exact active market fits, marketSlug MUST be null.
- Never invent a slug. Use only a slug in ACTIVE MARKETS.
- Fewer mappings are better than a weak or misleading mapping.
- Do not make a prediction or recommend buying, selling, trading, betting, or wagering.
- Return only valid JSON.

Return exactly:
{
  "analyses": [
    {
      "headlineIndex": 0,
      "marketSlug": "active-market-slug or null",
      "marketTitle": "active market title or No directly relevant active Limitless market found",
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
    categories: market.categories ?? [],
    tags: market.tags ?? [],
    properties: market.properties ?? [],
    automationType: market.automationType ?? "",
    expirationDate: market.expirationDate ?? "",
    outcomes: market.outcomes ?? [],
    yesPrice: market.yes,
    noPrice: market.no,
    volume: market.volume,
  })),
)}
`;
}

export async function GET(request: NextRequest) {
  const field = getField(request.nextUrl.searchParams.get("field"));
  const cacheKey = `limitless-radar:ai-analysis:v1:${field
    .toLowerCase()
    .replace(/\s+/g, "-")}`;
  const ttlSeconds = Math.floor(ANALYSIS_CACHE_MS[field] / 1000);

  try {
    if (redis) {
      const cached = await redis.get<{
        field: Field;
        updatedAt: string;
        provider: string;
        items: Array<{
          headline: Headline;
          analysis: ModelAnalysis;
        }>;
      }>(cacheKey);

      if (cached) {
        const ttl = await redis.ttl(cacheKey);

        return NextResponse.json({
          ...cached,
          cached: true,
          expiresAt:
            typeof ttl === "number" && ttl > 0
              ? new Date(Date.now() + ttl * 1000).toISOString()
              : null,
        });
      }
    }

    if (aiRateLimit) {
      const identifier = clientIp(request);
      const { success, reset } = await aiRateLimit.limit(identifier);

      if (!success) {
        const retryAfter = Math.max(
          1,
          Math.ceil((reset - Date.now()) / 1000),
        );

        return NextResponse.json(
          {
            error: "Too many analysis requests. Please try again shortly.",
            retryAfter,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfter),
            },
          },
        );
      }
    }

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
      items: buildItems(headlines, markets, parsedAnalyses, field),
    };

    if (redis) {
      await redis.set(cacheKey, value, { ex: ttlSeconds });
    }

    return NextResponse.json({
      ...value,
      cached: false,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
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