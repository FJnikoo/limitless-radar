import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type LimitlessMarket = {
  id?: number | string;
  title?: string;
  slug?: string;
  volume?: string | number;
  volumeFormatted?: string;
  categories?: unknown;
  tags?: unknown;
  automationType?: string;
  league?: unknown;
  sport?: unknown;
  properties?: Array<{
    propertyKeySlug?: string;
    value?: unknown;
  }>;
};

type EsportsMarket = {
  title: string;
  slug: string;
  volume: number;
  volumeFormatted: string;
  url: string;
};

type ScheduleFixture = {
  teamA: string;
  teamB: string;
  game: string;
  tournament: string;
  kickoff: string;
  format: string;
};

type TodayEsportsGame = {
  title: string;
  game: string;
  tournament: string;
  kickoff: string;
  format: string;
  marketSlug: string;
  marketUrl: string;
  marketVolume: number;
  marketVolumeFormatted: string;
};

type CachedValue<T> = {
  value: T;
  expiresAt: number;
};

const ESPORTS =
  /\b(esport|esports|cs2|csgo|counter-strike|counter strike|dota|league of legends|\blol\b|valorant|overwatch|mlbb|mobile legends|pubg|fortnite|rainbow six|rocket league|starcraft|call of duty|cs:go)\b/i;

const NOT_A_FIXTURE =
  /\b(total|sets?|games?|goals?|points?|kills?|assists?|headshots?|rounds?|maps?|map \d+|first|last|over|under|more|less|at least|or more|or fewer|handicap|spread|score|scorer|player|any player|quarter|half|period|inning|aces?|double faults?|breaks?|terminal|case|added|will .* be)\b/i;

const MARKET_PAGE_COUNT = 16;
const MARKET_PAGE_SIZE = 25;
const MARKETS_CACHE_MS = 2 * 60 * 1000;
const SCHEDULE_CACHE_MS = 30 * 60 * 1000;

let esportsMarketsCache: CachedValue<EsportsMarket[]> | null = null;
const scheduleCache = new Map<string, CachedValue<ScheduleFixture[]>>();

function utcDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function numberValue(value: unknown) {
  const amount = Number(value);

  return Number.isFinite(amount) ? amount : 0;
}

function volumeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 100_000 ? value / 1_000_000 : value;
  }

  const raw = String(value ?? "0").trim().toLowerCase();

  if (raw.includes(".")) {
    const decimal = Number(raw.replace(/,/g, ""));

    return Number.isFinite(decimal) ? decimal : 0;
  }

  const integer = numberValue(raw.replace(/,/g, ""));

  return integer > 100_000 ? integer / 1_000_000 : integer;
}

function formatVolume(value: unknown) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(volumeNumber(value));
}

function asTextList(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object" && "name" in item) {
        return String((item as { name?: string }).name ?? "");
      }

      return "";
    })
    .join(" ");
}

function objectText(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }

  return Object.values(value as Record<string, unknown>)
    .filter((item) => typeof item === "string" || typeof item === "number")
    .map(String)
    .join(" ");
}

function propertyText(market: LimitlessMarket) {
  return (market.properties ?? [])
    .map((property) => {
      const value = Array.isArray(property.value)
        ? property.value.join(" ")
        : String(property.value ?? "");

      return `${property.propertyKeySlug ?? ""} ${value}`;
    })
    .join(" ");
}

function marketText(market: LimitlessMarket) {
  return [
    market.title ?? "",
    asTextList(market.categories),
    asTextList(market.tags),
    market.automationType ?? "",
    objectText(market.league),
    objectText(market.sport),
    propertyText(market),
  ].join(" ");
}

function isEsportsFixtureMarket(market: LimitlessMarket) {
  const title = (market.title ?? "").trim();
  const text = marketText(market);

  return (
    Boolean(market.slug) &&
    Boolean(title) &&
    ESPORTS.test(text) &&
    /\bvs\.?\b|\bv\b/i.test(title) &&
    !NOT_A_FIXTURE.test(title)
  );
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

function teamTokens(value: string) {
  const ignored = new Set([
    "team",
    "gaming",
    "esports",
    "e",
    "sports",
    "club",
    "the",
  ]);

  return normaliseText(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !ignored.has(token));
}

function teamNamesMatch(first: string, second: string) {
  const normalisedFirst = normaliseText(first);
  const normalisedSecond = normaliseText(second);

  if (!normalisedFirst || !normalisedSecond) {
    return false;
  }

  if (
    normalisedFirst.includes(normalisedSecond) ||
    normalisedSecond.includes(normalisedFirst)
  ) {
    return true;
  }

  const firstTokens = teamTokens(first);
  const secondTokens = teamTokens(second);

  if (firstTokens.length === 0 || secondTokens.length === 0) {
    return false;
  }

  const shared = firstTokens.filter((token) => secondTokens.includes(token));

  return (
    shared.length >= Math.min(firstTokens.length, secondTokens.length) &&
    shared.length >= 1
  );
}

function teamsFromMarketTitle(title: string) {
  const match = title.match(/^(.+?)\s+(?:vs\.?|v)\s+(.+?)(?:\?|$)/i);

  if (!match) {
    return null;
  }

  const teamA = match[1].trim().replace(/^[^,]+,\s*/, "");
  const teamB = match[2].trim();

  return teamA && teamB ? { teamA, teamB } : null;
}

function marketMatchesFixture(
  marketTitle: string,
  scheduleTeamA: string,
  scheduleTeamB: string,
) {
  const teams = teamsFromMarketTitle(marketTitle);

  if (!teams) {
    return false;
  }

  const direct =
    teamNamesMatch(teams.teamA, scheduleTeamA) &&
    teamNamesMatch(teams.teamB, scheduleTeamB);

  const reversed =
    teamNamesMatch(teams.teamA, scheduleTeamB) &&
    teamNamesMatch(teams.teamB, scheduleTeamA);

  return direct || reversed;
}

function removeExpiredCache() {
  const now = Date.now();

  if (esportsMarketsCache && esportsMarketsCache.expiresAt <= now) {
    esportsMarketsCache = null;
  }

  for (const [date, cached] of scheduleCache) {
    if (cached.expiresAt <= now) {
      scheduleCache.delete(date);
    }
  }
}

async function fetchLimitlessEsportsMarkets() {
  if (
    esportsMarketsCache &&
    esportsMarketsCache.expiresAt > Date.now()
  ) {
    return esportsMarketsCache.value;
  }

  const requests = Array.from({ length: MARKET_PAGE_COUNT }, (_, index) =>
    fetch(
      `https://api.limitless.exchange/markets/active?automationType=sports&page=${
        index + 1
      }&limit=${MARKET_PAGE_SIZE}`,
      {
        cache: "no-store",
      },
    ).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Limitless market page ${index + 1} failed.`);
      }

      const data = await response.json();

      return Array.isArray(data.data)
        ? (data.data as LimitlessMarket[])
        : [];
    }),
  );

  const settledPages = await Promise.allSettled(requests);
  const pages = settledPages.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  if (pages.length === 0) {
    throw new Error("Limitless Esports markets could not be loaded.");
  }

  const unique = new Map<string, LimitlessMarket>();

  for (const market of pages.flat()) {
    const key = market.slug ?? String(market.id ?? "");

    if (key) {
      unique.set(key, market);
    }
  }

  const markets = [...unique.values()]
    .filter(isEsportsFixtureMarket)
    .map<EsportsMarket>((market) => ({
      title: market.title ?? "",
      slug: market.slug ?? "",
      volume: volumeNumber(market.volume ?? market.volumeFormatted),
      volumeFormatted: formatVolume(
        market.volume ?? market.volumeFormatted,
      ),
      url: market.slug
        ? `https://limitless.exchange/markets/${market.slug}`
        : "https://limitless.exchange",
    }));

  esportsMarketsCache = {
    value: markets,
    expiresAt: Date.now() + MARKETS_CACHE_MS,
  };

  return markets;
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
      content?: Array<{
        type?: string;
        text?: string;
      }>;
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

function isScheduleFixture(value: unknown): value is ScheduleFixture {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<ScheduleFixture>;

  return (
    typeof item.teamA === "string" &&
    typeof item.teamB === "string" &&
    item.teamA.trim().length > 0 &&
    item.teamB.trim().length > 0
  );
}

async function findTodayEsportsFixtures(
  date: string,
): Promise<ScheduleFixture[]> {
  const cached = scheduleCache.get(date);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const prompt = `
Use Google Search to find professional Esports matches scheduled for ${date}.

Return only valid JSON in this shape:
{
  "fixtures": [
    {
      "teamA": "first team",
      "teamB": "second team",
      "game": "League of Legends, Valorant, CS2, Dota 2, etc.",
      "tournament": "tournament name or Unknown",
      "kickoff": "ISO-8601 UTC timestamp or Unknown",
      "format": "BO1, BO3, BO5, or Unknown"
    }
  ]
}

Rules:
- Include only professional team-versus-team Esports matches scheduled on ${date}.
- Do not include player props, map props, kill props, odds, predictions, historical results, or non-Esports sports.
- Use current schedules from reliable tournament, league, or event sources.
- If exact kickoff is uncertain, use "Unknown"; do not invent a time.
- Return at most 40 fixtures.
- Do not write analysis, markdown, citations, or any text outside the JSON.
`;

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
        tools: [{ type: "google_search" }],
      }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? "Gemini is unavailable.");
  }

  const text = getGeminiText(data);

  if (!text) {
    throw new Error("Gemini returned an empty schedule response.");
  }

  let parsed: { fixtures?: unknown[] };

  try {
    parsed = JSON.parse(cleanJson(text)) as {
      fixtures?: unknown[];
    };
  } catch {
    throw new Error("Gemini did not return valid Esports schedule JSON.");
  }

  const fixtures = Array.isArray(parsed.fixtures)
    ? parsed.fixtures.filter(isScheduleFixture).slice(0, 40)
    : [];

  scheduleCache.set(date, {
    value: fixtures,
    expiresAt: Date.now() + SCHEDULE_CACHE_MS,
  });

  return fixtures;
}

export async function GET(request: NextRequest) {
  const requestedDate = request.nextUrl.searchParams.get("date")?.trim();
  const date =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : utcDate();

  try {
    removeExpiredCache();

    const marketsPromise = fetchLimitlessEsportsMarkets();
    const schedulePromise = findTodayEsportsFixtures(date).catch((error) => {
      console.warn("Esports schedule lookup failed.", error);
      return [] as ScheduleFixture[];
    });

    const [markets, schedule] = await Promise.all([
      marketsPromise,
      schedulePromise,
    ]);

    const games = markets
      .map((market) => {
        const fixture = schedule.find((candidate) =>
          marketMatchesFixture(
            market.title,
            candidate.teamA,
            candidate.teamB,
          ),
        );

        let kickoff = "";
        let game = "Unknown";
        let tournament = "Unknown";
        let format = "Unknown";

        if (fixture) {
          game = fixture.game?.trim() || "Unknown";
          tournament = fixture.tournament?.trim() || "Unknown";
          format = fixture.format?.trim() || "Unknown";

          if (fixture.kickoff && fixture.kickoff !== "Unknown") {
            const parsedKickoff = new Date(fixture.kickoff);

            if (!Number.isNaN(parsedKickoff.getTime())) {
              kickoff = parsedKickoff.toISOString();
            }
          }
        }

        return {
          title: market.title,
          game,
          tournament,
          kickoff,
          format,
          marketSlug: market.slug,
          marketUrl: market.url,
          marketVolume: market.volume,
          marketVolumeFormatted: market.volumeFormatted,
        } satisfies TodayEsportsGame;
      })
      .sort((a, b) => {
        if (b.marketVolume !== a.marketVolume) {
          return b.marketVolume - a.marketVolume;
        }

        if (!a.kickoff) return 1;
        if (!b.kickoff) return -1;

        return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
      })
      .slice(0, 5);

    return NextResponse.json({
      date,
      timezone: "UTC",
      games,
      scheduleFixturesFound: schedule.length,
      limitlessFixtureMarketsFound: markets.length,
    });
  } catch (error) {
    console.error("Esports today route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load today's Esports fixtures.",
      },
      { status: 500 },
    );
  }
}