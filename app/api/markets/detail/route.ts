import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RawMarket = {
  id?: string | number;
  slug?: string;
  title?: string;
  name?: string;
  prices?: unknown[];
  volume?: string | number;
  volumeFormatted?: string;
  expirationDate?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  parentMarketId?: string | number | null;
  parent_market_id?: string | number | null;
  parentId?: string | number | null;
  parent_id?: string | number | null;
  groupId?: string | number | null;
  group_id?: string | number | null;
  groupSlug?: string | null;
  group_slug?: string | null;
  markets?: RawMarket[];
  children?: RawMarket[];
  outcomes?: RawMarket[];
  data?: RawMarket | RawMarket[];
  group?: RawMarket | null;
  parentMarket?: RawMarket | null;
  parent_market?: RawMarket | null;
  parent?: RawMarket | null;
  tradePrices?: {
    buy?: {
      market?: unknown[];
      limit?: unknown[];
    };
  };
};

type Outcome = {
  name: string;
  price: number;
  lastPrice: number;
  volume: string;
  slug: string;
};

type FootballResult = "W" | "D" | "L";

type FootballHistoryMatch = {
  fixtureId: number | null;
  dateUtc: string | null;
  leagueName: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
};

type FootballForm = {
  teamName: string | null;
  results: FootballResult[];
  wins: number;
  draws: number;
  losses: number;
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
  source: "Limitless sports event";
};

type LimitlessFootballMatch = {
  fixtureId?: number | string | null;
  dateUtc?: string | null;
  leagueName?: string | null;
  home?: {
    id?: number | string | null;
    name?: string | null;
    goals?: number | null;
  };
  away?: {
    id?: number | string | null;
    name?: string | null;
    goals?: number | null;
  };
};

type LimitlessFootballEvent = {
  sportType?: string | null;
  eventId?: string | number | null;
  generalInfo?: {
    kickoffTimestamp?: number | null;
    referee?: string | null;
    league?: {
      name?: string | null;
      country?: string | null;
      round?: string | null;
    } | null;
    stadium?: {
      name?: string | null;
      city?: string | null;
    } | null;
    status?: {
      short?: string | null;
      long?: string | null;
    } | null;
    teams?: {
      home?: {
        id?: number | string | null;
        name?: string | null;
      } | null;
      away?: {
        id?: number | string | null;
        name?: string | null;
      } | null;
    } | null;
  } | null;
  h2h?: {
    matches?: LimitlessFootballMatch[] | null;
  } | null;
  recentForm?: {
    home?: {
      matches?: LimitlessFootballMatch[] | null;
    } | null;
    away?: {
      matches?: LimitlessFootballMatch[] | null;
    } | null;
  } | null;
};

type CachedValue<T> = {
  value: T;
  expiresAt: number;
};

const marketCache = new Map<string, CachedValue<RawMarket>>();
const footballEventCache = new Map<
  string,
  CachedValue<LimitlessFootballEvent>
>();

const MARKET_CACHE_MS = 30 * 1000;
const FOOTBALL_EVENT_CACHE_MS = 2 * 60 * 1000;

function numberValue(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function normalisePrice(value: unknown) {
  const amount = numberValue(value);

  return amount > 1
    ? Math.max(0, Math.min(1, amount / 100))
    : Math.max(0, Math.min(1, amount));
}

function buyPrice(market: RawMarket) {
  const marketPrice = market.tradePrices?.buy?.market?.[0];

  if (marketPrice !== undefined && marketPrice !== null) {
    return normalisePrice(marketPrice);
  }

  const limitPrice = market.tradePrices?.buy?.limit?.[0];

  if (limitPrice !== undefined && limitPrice !== null) {
    return normalisePrice(limitPrice);
  }

  return normalisePrice(market.prices?.[0]);
}

function candidateName(market: RawMarket) {
  return String(market.title ?? market.name ?? "").trim();
}

function isYesNo(value: string) {
  return /^(yes|no)$/i.test(value.trim());
}

function isFixtureTitle(title: string) {
  return /\bvs\.?\b|\bv\b/i.test(title);
}

function teamsFromTitle(title: string) {
  const match = title.match(/^(.+?)\s+(?:vs\.?|v)\s+(.+?)(?:\?|$)/i);

  if (!match) {
    return null;
  }

  const teamA = match[1].trim().replace(/^[^,]+,\s*/, "");
  const teamB = match[2].trim();

  return teamA && teamB ? { teamA, teamB } : null;
}

function arrayValue(value: unknown): RawMarket[] {
  return Array.isArray(value) ? (value as RawMarket[]) : [];
}

function collectChildMarkets(market: RawMarket) {
  const direct = [
    ...arrayValue(market.markets),
    ...arrayValue(market.children),
    ...arrayValue(market.outcomes),
  ];

  const parents = [
    market.group,
    market.parentMarket,
    market.parent_market,
    market.parent,
  ];

  const nested = parents.flatMap((parent) => {
    if (!parent) {
      return [];
    }

    return [
      ...arrayValue(parent.markets),
      ...arrayValue(parent.children),
      ...arrayValue(parent.outcomes),
    ];
  });

  const dataMarkets = Array.isArray(market.data)
    ? market.data
    : market.data
      ? [market.data]
      : [];

  return [...direct, ...nested, ...dataMarkets];
}

function outcomeList(market: RawMarket): Outcome[] {
  const unique = new Map<string, Outcome>();

  for (const child of collectChildMarkets(market)) {
    const name = candidateName(child);

    if (!name || isYesNo(name)) {
      continue;
    }

    const slug = String(child.slug ?? "");
    const key = `${name.toLowerCase()}-${slug}`;

    unique.set(key, {
      name,
      price: buyPrice(child),
      lastPrice: normalisePrice(child.prices?.[0]),
      volume: String(child.volumeFormatted ?? child.volume ?? "0"),
      slug,
    });
  }

  return [...unique.values()];
}

function binaryFixtureOutcomes(market: RawMarket): Outcome[] {
  const teams = teamsFromTitle(candidateName(market));

  if (!teams) {
    return [];
  }

  const yes = buyPrice(market);
  const lastYes = normalisePrice(market.prices?.[0]);
  const volume = String(market.volumeFormatted ?? market.volume ?? "0");
  const slug = String(market.slug ?? "");

  return [
    {
      name: teams.teamA,
      price: yes,
      lastPrice: lastYes,
      volume,
      slug,
    },
    {
      name: teams.teamB,
      price: Math.max(0, 1 - yes),
      lastPrice: Math.max(0, 1 - lastYes),
      volume,
      slug,
    },
  ];
}

function formResult(
  match: LimitlessFootballMatch,
  teamId: string | number | null | undefined,
): FootballResult | null {
  const homeGoals = nullableNumber(match.home?.goals);
  const awayGoals = nullableNumber(match.away?.goals);

  if (homeGoals === null || awayGoals === null) {
    return null;
  }

  const isHome = String(match.home?.id ?? "") === String(teamId ?? "");
  const isAway = String(match.away?.id ?? "") === String(teamId ?? "");

  if (!isHome && !isAway) {
    return null;
  }

  const teamGoals = isHome ? homeGoals : awayGoals;
  const opponentGoals = isHome ? awayGoals : homeGoals;

  if (teamGoals > opponentGoals) {
    return "W";
  }

  if (teamGoals < opponentGoals) {
    return "L";
  }

  return "D";
}

function buildForm(
  teamName: string | null | undefined,
  teamId: string | number | null | undefined,
  matches: LimitlessFootballMatch[] | null | undefined,
): FootballForm {
  const newestToOldest = [...(matches ?? [])]
    .sort(
      (a, b) =>
        new Date(b.dateUtc ?? 0).getTime() -
        new Date(a.dateUtc ?? 0).getTime(),
    )
    .map((match) => formResult(match, teamId))
    .filter((result): result is FootballResult => result !== null)
    .slice(0, 5);

  const results = [...newestToOldest].reverse();

  return {
    teamName: teamName ?? null,
    results,
    wins: results.filter((result) => result === "W").length,
    draws: results.filter((result) => result === "D").length,
    losses: results.filter((result) => result === "L").length,
  };
}

function historyMatches(
  matches: LimitlessFootballMatch[] | null | undefined,
): FootballHistoryMatch[] {
  return [...(matches ?? [])]
    .sort(
      (a, b) =>
        new Date(b.dateUtc ?? 0).getTime() -
        new Date(a.dateUtc ?? 0).getTime(),
    )
    .slice(0, 5)
    .map((match) => ({
      fixtureId: nullableNumber(match.fixtureId),
      dateUtc: match.dateUtc ?? null,
      leagueName: match.leagueName ?? null,
      homeTeam: match.home?.name ?? null,
      awayTeam: match.away?.name ?? null,
      homeGoals: nullableNumber(match.home?.goals),
      awayGoals: nullableNumber(match.away?.goals),
    }));
}

function formatVenue(
  stadium:
    | {
        name?: string | null;
        city?: string | null;
      }
    | null
    | undefined,
) {
  const name = String(stadium?.name ?? "").trim();
  const city = String(stadium?.city ?? "").trim();

  return name && city ? `${name}, ${city}` : name || city || null;
}

function kickoffFromUnix(timestamp: number | null | undefined) {
  return timestamp && Number.isFinite(timestamp)
    ? new Date(timestamp * 1000).toISOString()
    : null;
}

function extractFootballResearch(
  event: LimitlessFootballEvent,
): FootballResearch | null {
  if (event.sportType !== "football" || !event.eventId) {
    return null;
  }

  const info = event.generalInfo;
  const homeTeam = info?.teams?.home;
  const awayTeam = info?.teams?.away;

  return {
    eventId: String(event.eventId),
    competition: info?.league?.name ?? null,
    country: info?.league?.country ?? null,
    round: info?.league?.round ?? null,
    kickoff: kickoffFromUnix(info?.kickoffTimestamp),
    status: info?.status?.long ?? info?.status?.short ?? null,
    venue: formatVenue(info?.stadium),
    referee: info?.referee ?? null,
    homeTeam: homeTeam?.name ?? null,
    awayTeam: awayTeam?.name ?? null,
    homeForm: buildForm(
      homeTeam?.name,
      homeTeam?.id,
      event.recentForm?.home?.matches,
    ),
    awayForm: buildForm(
      awayTeam?.name,
      awayTeam?.id,
      event.recentForm?.away?.matches,
    ),
    headToHead: historyMatches(event.h2h?.matches),
    source: "Limitless sports event",
  };
}

function removeExpiredCache() {
  const now = Date.now();

  for (const [key, cached] of marketCache) {
    if (cached.expiresAt <= now) {
      marketCache.delete(key);
    }
  }

  for (const [key, cached] of footballEventCache) {
    if (cached.expiresAt <= now) {
      footballEventCache.delete(key);
    }
  }
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message ??
        data?.error?.message ??
        "Limitless market details could not be loaded.",
    );
  }

  return data;
}

async function fetchMarketBySlug(slug: string) {
  const cached = marketCache.get(`slug:${slug}`);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const data = await fetchJson(
    `https://api.limitless.exchange/markets/${encodeURIComponent(slug)}`,
  );

  const market = (data?.data ?? data) as RawMarket;

  marketCache.set(`slug:${slug}`, {
    value: market,
    expiresAt: Date.now() + MARKET_CACHE_MS,
  });

  return market;
}

async function fetchMarketById(id: string | number) {
  const key = `id:${String(id)}`;
  const cached = marketCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const data = await fetchJson(
    `https://api.limitless.exchange/markets/${encodeURIComponent(String(id))}`,
  );

  const market = (data?.data ?? data) as RawMarket;

  marketCache.set(key, {
    value: market,
    expiresAt: Date.now() + MARKET_CACHE_MS,
  });

  return market;
}

async function fetchFootballEvent(eventId: string) {
  const cached = footballEventCache.get(eventId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const data = await fetchJson(
    `https://api.limitless.exchange/sports/events?sportType=football&eventId=${encodeURIComponent(
      eventId,
    )}`,
  );

  const event = (data?.data ?? data) as LimitlessFootballEvent;

  footballEventCache.set(eventId, {
    value: event,
    expiresAt: Date.now() + FOOTBALL_EVENT_CACHE_MS,
  });

  return event;
}

async function resolveParentMarket(market: RawMarket) {
  const groupSlug = market.groupSlug ?? market.group_slug;

  if (groupSlug) {
    try {
      return await fetchMarketBySlug(groupSlug);
    } catch {
      // Continue to ID lookup.
    }
  }

  const parentId =
    market.parentMarketId ??
    market.parent_market_id ??
    market.parentId ??
    market.parent_id ??
    market.groupId ??
    market.group_id;

  if (parentId === undefined || parentId === null) {
    return null;
  }

  try {
    return await fetchMarketById(parentId);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim();
  const sportType = request.nextUrl.searchParams.get("sportType")?.trim();
  const eventId = request.nextUrl.searchParams.get("eventId")?.trim();

  if (!slug) {
    return NextResponse.json(
      { error: "A market slug is required." },
      { status: 400 },
    );
  }

  try {
    removeExpiredCache();

    const marketPromise = fetchMarketBySlug(slug);
    const footballEventPromise =
      sportType === "football" && eventId
        ? fetchFootballEvent(eventId).catch(() => null)
        : Promise.resolve(null);

    const [market, footballEvent] = await Promise.all([
      marketPromise,
      footballEventPromise,
    ]);

    let outcomes = outcomeList(market);
    let source = "Limitless market detail";

    if (outcomes.length === 0) {
      const parent = await resolveParentMarket(market);

      if (parent) {
        const parentOutcomes = outcomeList(parent);

        if (parentOutcomes.length > 0) {
          outcomes = parentOutcomes;
          source = "Limitless parent/group detail";
        }
      }
    }

    const title = candidateName(market) || "Untitled market";

    if (outcomes.length === 0 && isFixtureTitle(title)) {
      outcomes = binaryFixtureOutcomes(market);

      if (outcomes.length > 0) {
        source = "Limitless binary fixture market";
      }
    }

    return NextResponse.json({
      slug,
      title,
      isFixture: isFixtureTitle(title),
      outcomes,
      volume: String(market.volumeFormatted ?? market.volume ?? "0"),
      marketTime:
        market.startDate ??
        market.startTime ??
        market.endDate ??
        market.expirationDate ??
        null,
      url: `https://limitless.exchange/markets/${slug}`,
      source,
      footballResearch: footballEvent
        ? extractFootballResearch(footballEvent)
        : null,
    });
  } catch (error) {
    console.error("Limitless market detail route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load market details.",
      },
      { status: 500 },
    );
  }
}