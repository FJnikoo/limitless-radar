import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FootballFixture = {
  fixture?: {
    id?: number;
    date?: string;
    venue?: {
      name?: string | null;
      city?: string | null;
    };
  };
  league?: {
    id?: number;
    name?: string;
    country?: string;
  };
  teams?: {
    home?: {
      id?: number;
      name?: string;
    };
    away?: {
      id?: number;
      name?: string;
    };
  };
};

type LimitlessMarket = {
  id?: string | number;
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

type TodayGame = {
  fixtureId: number;
  eventId: string;
  title: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoff: string;
  venue: string | null;
  marketSlug: string;
  marketUrl: string;
  marketVolume: number;
  marketVolumeFormatted: string;
};

type CachedValue<T> = {
  value: T;
  expiresAt: number;
};

const ALLOWED_LEAGUES = new Set([
  39, // Premier League
  40, // Championship
  41, // League One
  42, // League Two
  45, // FA Cup
  48, // League Cup / Carabao Cup
  140, // La Liga
  135, // Serie A
  78, // Serie B
  137, // Coppa Italia
  94, // Primeira Liga
  2, // UEFA Champions League
  3, // UEFA Europa League
  848, // UEFA Conference League
]);

const TEAM_ALIASES: Record<string, string[]> = {
  palermo: [
    "palermo",
    "palermo fc",
    "palermo calcio",
    "citta di palermo",
    "us citta di palermo",
    "u s citta di palermo",
  ],
  "queens park rangers": ["queens park rangers", "qpr"],
  qpr: ["qpr", "queens park rangers"],
  "west bromwich albion": ["west bromwich albion", "west brom"],
  "west brom": ["west brom", "west bromwich albion"],
  "real sociedad": [
    "real sociedad",
    "real sociedad de futbol",
    "real sociedad de fútbol",
  ],
  "athletic club": ["athletic club", "athletic bilbao"],
  "athletic bilbao": ["athletic bilbao", "athletic club"],
  "manchester city": ["manchester city", "man city"],
  "manchester united": ["manchester united", "man utd", "man united"],
  "tottenham hotspur": ["tottenham hotspur", "tottenham", "spurs"],
  "wolverhampton wanderers": ["wolverhampton wanderers", "wolves"],
  "brighton": ["brighton", "brighton hove albion"],
  "brighton hove albion": ["brighton hove albion", "brighton"],
  "nottingham forest": ["nottingham forest", "nottm forest"],
  "leeds united": ["leeds united", "leeds"],
  "sheffield united": ["sheffield united", "sheff utd"],
  "sheffield wednesday": ["sheffield wednesday", "sheff wed"],
  "stoke city": ["stoke city", "stoke"],
  "bristol city": ["bristol city", "bristol"],
  "coventry city": ["coventry city", "coventry"],
  "swansea city": ["swansea city", "swansea"],
  "cardiff city": ["cardiff city", "cardiff"],
  "middlesbrough": ["middlesbrough", "boro"],
  "deportivo la coruna": ["deportivo la coruna", "deportivo"],
  "deportivo la coruña": ["deportivo la coruna", "deportivo"],
  "racing santander": ["racing santander", "racing"],
  "real zaragoza": ["real zaragoza", "zaragoza"],
  "real valladolid": ["real valladolid", "valladolid"],
  "sporting gijon": ["sporting gijon", "sporting"],
  "sporting de gijon": ["sporting de gijon", "sporting gijon", "sporting"],
  "union deportiva almeria": ["union deportiva almeria", "almeria"],
  almeria: ["almeria", "union deportiva almeria"],
};

const fixturesCache = new Map<string, CachedValue<FootballFixture[]>>();
let marketsCache: CachedValue<LimitlessMarket[]> | null = null;

const FIXTURES_CACHE_MS = 2 * 60 * 1000;
const MARKETS_CACHE_MS = 2 * 60 * 1000;
const MARKET_PAGE_COUNT = 20;
const MARKET_PAGE_SIZE = 25;

function getUtcDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normaliseText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normaliseTeamKey(value: string) {
  return normaliseText(value)
    .replace(/\b(fc|cf|sc|afc|ac|as|us|ssc|calcio|club|de|del|di|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(normaliseText).filter(Boolean))];
}

function teamAliases(teamName: string) {
  const normalised = normaliseText(teamName);
  const key = normaliseTeamKey(teamName);
  const configured = [
    ...(TEAM_ALIASES[normalised] ?? []),
    ...(TEAM_ALIASES[key] ?? []),
  ];

  const simplified = normaliseTeamKey(teamName);
  const words = simplified.split(" ").filter(Boolean);

  const generated = [
    teamName,
    normalised,
    simplified,
    words.length > 1 ? words.slice(0, 2).join(" ") : "",
    words.length > 2 ? words.slice(0, 3).join(" ") : "",
  ];

  return uniqueStrings([...configured, ...generated]).filter(
    (alias) => alias.length >= 3,
  );
}

function titleContainsAlias(title: string, alias: string) {
  const paddedTitle = ` ${normaliseText(title)} `;
  const paddedAlias = ` ${normaliseText(alias)} `;

  return paddedTitle.includes(paddedAlias);
}

function titleHasTeamAlias(marketTitle: string, teamName: string) {
  return teamAliases(teamName).some((alias) =>
    titleContainsAlias(marketTitle, alias),
  );
}

function titleHasBothTeams(
  marketTitle: string,
  homeTeam: string,
  awayTeam: string,
) {
  if (!marketTitle.trim()) {
    return false;
  }

  return (
    titleHasTeamAlias(marketTitle, homeTeam) &&
    titleHasTeamAlias(marketTitle, awayTeam)
  );
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

  const integer = Number(raw.replace(/,/g, ""));

  if (!Number.isFinite(integer)) {
    return 0;
  }

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

function isFootballMarket(market: LimitlessMarket) {
  return /\b(football|soccer|efl|premier league|championship|la liga|bundesliga|serie a|serie b|primeira|portuguese|uefa|champions league|europa league|conference league|copa|world cup|fa cup|carabao|coppa|coppaita|dfb|ligue 1|ligue 2)\b/i.test(
    marketText(market),
  );
}

function getCachedFixtures(date: string) {
  const cached = fixturesCache.get(date);

  return cached && cached.expiresAt > Date.now() ? cached.value : null;
}

function getCachedMarkets() {
  return marketsCache && marketsCache.expiresAt > Date.now()
    ? marketsCache.value
    : null;
}

function removeExpiredCache() {
  const now = Date.now();

  for (const [date, cached] of fixturesCache) {
    if (cached.expiresAt <= now) {
      fixturesCache.delete(date);
    }
  }

  if (marketsCache && marketsCache.expiresAt <= now) {
    marketsCache = null;
  }
}

async function fetchApiFootballToday(date: string) {
  const cached = getCachedFixtures(date);

  if (cached) {
    return cached;
  }

  const key = process.env.API_FOOTBALL_KEY;

  if (!key) {
    throw new Error("API_FOOTBALL_KEY is not configured.");
  }

  const response = await fetch(
    `https://v3.football.api-sports.io/fixtures?date=${encodeURIComponent(date)}`,
    {
      headers: {
        "x-apisports-key": key,
      },
      cache: "no-store",
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message ??
        data?.errors?.token ??
        "API-Football fixtures could not be loaded.",
    );
  }

  const fixtures = Array.isArray(data.response)
    ? (data.response as FootballFixture[])
    : [];

  fixturesCache.set(date, {
    value: fixtures,
    expiresAt: Date.now() + FIXTURES_CACHE_MS,
  });

  return fixtures;
}

async function fetchLimitlessSportsMarkets() {
  const cached = getCachedMarkets();

  if (cached) {
    return cached;
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
    throw new Error("Limitless sports markets could not be loaded.");
  }

  const unique = new Map<string, LimitlessMarket>();

  for (const market of pages.flat()) {
    const key = market.slug ?? String(market.id ?? "");

    if (key) {
      unique.set(key, market);
    }
  }

  const markets = [...unique.values()].filter(isFootballMarket);

  marketsCache = {
    value: markets,
    expiresAt: Date.now() + MARKETS_CACHE_MS,
  };

  return markets;
}

function buildTodayGame(
  fixture: FootballFixture,
  markets: LimitlessMarket[],
): TodayGame | null {
  const homeTeam = fixture.teams?.home?.name?.trim() ?? "";
  const awayTeam = fixture.teams?.away?.name?.trim() ?? "";
  const kickoff = fixture.fixture?.date ?? "";
  const fixtureId = fixture.fixture?.id;
  const competition = fixture.league?.name?.trim() ?? "";

  if (!homeTeam || !awayTeam || !kickoff || !fixtureId || !competition) {
    return null;
  }

  const matchingMarkets = markets.filter((market) =>
    titleHasBothTeams(market.title ?? "", homeTeam, awayTeam),
  );

  if (matchingMarkets.length === 0) {
    return null;
  }

  const bestMarket = [...matchingMarkets].sort(
    (a, b) =>
      volumeNumber(b.volume ?? b.volumeFormatted) -
      volumeNumber(a.volume ?? a.volumeFormatted),
  )[0];

  const venueName = fixture.fixture?.venue?.name?.trim() ?? "";
  const venueCity = fixture.fixture?.venue?.city?.trim() ?? "";

  return {
    fixtureId,
    eventId: String(fixtureId),
    title: `${homeTeam} vs ${awayTeam}`,
    homeTeam,
    awayTeam,
    competition,
    kickoff,
    venue:
      venueName && venueCity
        ? `${venueName}, ${venueCity}`
        : venueName || venueCity || null,
    marketSlug: bestMarket.slug ?? "",
    marketUrl: bestMarket.slug
      ? `https://limitless.exchange/markets/${bestMarket.slug}`
      : "https://limitless.exchange",
    marketVolume: volumeNumber(
      bestMarket.volume ?? bestMarket.volumeFormatted,
    ),
    marketVolumeFormatted: formatVolume(
      bestMarket.volume ?? bestMarket.volumeFormatted,
    ),
  };
}

export async function GET(request: NextRequest) {
  const requestedDate = request.nextUrl.searchParams.get("date")?.trim();
  const date =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : getUtcDate();

  try {
    removeExpiredCache();

    const [fixtures, limitlessMarkets] = await Promise.all([
      fetchApiFootballToday(date),
      fetchLimitlessSportsMarkets(),
    ]);

    const games = fixtures
      .filter((fixture) => ALLOWED_LEAGUES.has(fixture.league?.id ?? -1))
      .map((fixture) => buildTodayGame(fixture, limitlessMarkets))
      .filter((game): game is TodayGame => game !== null)
      .sort((a, b) => {
        if (b.marketVolume !== a.marketVolume) {
          return b.marketVolume - a.marketVolume;
        }

        return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
      })
      .slice(0, 5);

    return NextResponse.json({
      date,
      timezone: "UTC",
      leagues: [
        "Premier League",
        "EFL Championship",
        "League One",
        "League Two",
        "FA Cup",
        "Carabao Cup",
        "La Liga",
        "Serie A",
        "Serie B",
        "Coppa Italia",
        "Primeira Liga",
        "UEFA Champions League",
        "UEFA Europa League",
        "UEFA Conference League",
      ],
      games,
    });
  } catch (error) {
    console.error("Football today route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load today's football fixtures.",
      },
      { status: 500 },
    );
  }
}