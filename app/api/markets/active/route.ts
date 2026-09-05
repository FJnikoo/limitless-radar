import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Field =
  | "Crypto"
  | "Sports"
  | "Esports"
  | "Politics"
  | "Finance"
  | "World Events";

type ChildMarket = {
  id?: number | string;
  title?: string;
  slug?: string;
  volume?: string | number;
  volumeFormatted?: string;
  prices?: number[];
  tradePrices?: {
    buy?: {
      market?: number[];
      limit?: number[];
    };
    sell?: {
      market?: number[];
      limit?: number[];
    };
  };
};

type LimitlessMarket = {
  id?: number | string;
  title?: string;
  slug?: string;
  prices?: number[];
  volumeFormatted?: string;
  volume?: string | number;
  categories?: unknown;
  tags?: unknown;
  automationType?: string;
  fixtureId?: string | number | null;
  fixture_id?: string | number | null;
  eventId?: string | number | null;
  event_id?: string | number | null;
  gameId?: string | number | null;
  game_id?: string | number | null;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  expirationDate?: string;
  expirationTimestamp?: number;
  league?: unknown;
  sport?: unknown;
  marketType?: string;
  properties?: Array<{
    propertyKeySlug?: string;
    value?: unknown;
  }>;
  markets?: ChildMarket[];
};

type Outcome = {
  name: string;
  price: number;
  lastPrice: number;
  volume: string;
  slug: string;
};

const FIELDS: Field[] = [
  "Crypto",
  "Sports",
  "Esports",
  "Politics",
  "Finance",
  "World Events",
];

const CRYPTO =
  /\b(btc|bitcoin|eth|ethereum|sol|solana|doge|dogecoin|xrp|ada|avax|bnb|pepe|wif|crypto|token|blockchain|onchain)\b/i;

const ESPORTS =
  /\b(esport|esports|cs2|csgo|counter-strike|counter strike|dota|league of legends|\blol\b|valorant|overwatch|mlbb|mobile legends|pubg|fortnite|rainbow six|rocket league|starcraft|call of duty|cs:go)\b/i;

const SPORTS =
  /\b(football|soccer|nba|nfl|mlb|nhl|tennis|premier league|la liga|bundesliga|serie a|champions league|uefa|ufc|mma|f1|formula|world cup|match|golf|cricket|rugby|hockey)\b/i;

const FINANCE =
  /\b(stock|nasdaq|s&p|spx|dow|fed|cpi|inflation|gdp|unemployment|interest rate|treasury|oil|gold|earnings|tesla|apple|nvidia|amazon|google|microsoft|meta|spy)\b/i;

const POLITICS =
  /\b(election|president|senate|parliament|vote|trump|biden|putin|war|sanctions|nato|congress|minister|party|democrat|republican|poll)\b/i;

const NOT_A_MATCH =
  /\b(join|sign|signing|transfer|leave|stay|spend|window|contract|loan|manager|coach|sack|sacked|appoint|next club|season total|top scorer|award|champion|winner|relegat|qualif|finish|draft|mvp)\b/i;

function getField(value: string | null): Field {
  return FIELDS.includes(value as Field) ? (value as Field) : "Crypto";
}

function asTextList(value: unknown) {
  if (!Array.isArray(value)) return "";

  return value
    .map((item) => {
      if (typeof item === "string") return item;

      if (item && typeof item === "object" && "name" in item) {
        return String((item as { name?: string }).name ?? "");
      }

      return "";
    })
    .join(" ");
}

function objectText(value: unknown) {
  if (!value || typeof value !== "object") return "";

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

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function volumeNumber(market: LimitlessMarket) {
  const source = market.volume ?? market.volumeFormatted ?? "0";

  if (typeof source === "number" && Number.isFinite(source)) {
    return source;
  }

  const raw = String(source).replace(/,/g, "").trim().toLowerCase();
  const match = raw.match(/^([\d.]+)\s*([kmb])?/);
  if (!match) return 0;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;

  if (match[2] === "k") return amount * 1_000;
  if (match[2] === "m") return amount * 1_000_000;
  if (match[2] === "b") return amount * 1_000_000_000;

  return amount;
}

function childVolumeNumber(market: ChildMarket) {
  const source = market.volume ?? market.volumeFormatted ?? "0";

  if (typeof source === "number" && Number.isFinite(source)) {
    return source;
  }

  const raw = String(source).replace(/,/g, "").trim().toLowerCase();
  const match = raw.match(/^([\d.]+)\s*([kmb])?/);
  if (!match) return 0;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;

  if (match[2] === "k") return amount * 1_000;
  if (match[2] === "m") return amount * 1_000_000;
  if (match[2] === "b") return amount * 1_000_000_000;

  return amount;
}

function price(value: unknown) {
  const number = toNumber(value);
  return number > 1 ? number / 100 : number;
}

function yesPrice(market: LimitlessMarket) {
  return price(market.prices?.[0]);
}

function childBuyPrice(market: ChildMarket) {
  const buyMarket = market.tradePrices?.buy?.market?.[0];

  if (buyMarket !== undefined && buyMarket !== null) {
    return price(buyMarket);
  }

  return price(market.prices?.[0]);
}

function classify(market: LimitlessMarket): Field | null {
  const text = marketText(market);
  const automation = (market.automationType ?? "").toLowerCase();

  if (automation === "sports" || ESPORTS.test(text) || SPORTS.test(text)) {
    return ESPORTS.test(text) ? "Esports" : "Sports";
  }

  if (automation === "lumy") {
    return CRYPTO.test(text) ? "Crypto" : "Finance";
  }

  if (CRYPTO.test(text)) return "Crypto";
  if (FINANCE.test(text)) return "Finance";
  if (POLITICS.test(text)) return "Politics";
  if (automation === "manual") return "World Events";

  return null;
}

function hasFixtureId(market: LimitlessMarket) {
  return Boolean(
    market.fixtureId ??
      market.fixture_id ??
      market.eventId ??
      market.event_id ??
      market.gameId ??
      market.game_id,
  );
}

function looksLikeMatchTitle(title: string) {
  const hasTeamsVersus = /\bvs\.?\b|\bv\b/i.test(title);
  const hasMatchWords =
    /\b(match|game|fixture|series|map|best of|bo1|bo2|bo3|bo5)\b/i.test(title);

  return (hasTeamsVersus || hasMatchWords) && !NOT_A_MATCH.test(title);
}

function isMatchMarket(market: LimitlessMarket, field: Field) {
  if (classify(market) !== field) {
    return false;
  }

  const title = (market.title ?? "").trim();
  const text = marketText(market);

  if (!title || NOT_A_MATCH.test(title)) {
    return false;
  }

  // A real fixture must name two opponents.
  if (!/\bvs\.?\b|\bv\b/i.test(title)) {
    return false;
  }

  // Remove match props such as total sets, kills, maps, first blood,
  // over/under, scorers, and other side markets.
  const isPropMarket =
    /\b(total|sets?|games?|goals?|points?|kills?|assists?|headshots?|rounds?|maps?|first|last|over|under|more|less|at least|or more|or fewer|handicap|spread|both teams|btts|score|scorer|player|quarter|half|period|inning|aces?|double faults?|breaks?)\b/i.test(
      title,
    );

  if (isPropMarket) {
    return false;
  }

  if (field === "Esports") {
    // Esports: only genuine team-vs-team fixture titles.
    return true;
  }

  // Sports tab's Important games list: football/soccer only.
  return /\b(football|soccer|efl|premier league|championship|la liga|bundesliga|serie a|liga|eredivisie|uefa|champions league|europa league|conference league|copa|world cup|fa cup|carabao|coppa|dfb|ligue 1|ligue 2)\b/i.test(
    text,
  );
}

function outcomesOf(market: LimitlessMarket): Outcome[] {
  if (Array.isArray(market.markets) && market.markets.length > 0) {
    return market.markets
      .map((child) => ({
        name: child.title ?? "Outcome",
        price: childBuyPrice(child),
        lastPrice: price(child.prices?.[0]),
        volume: String(child.volumeFormatted ?? child.volume ?? "0"),
        slug: child.slug ?? "",
        sortVolume: childVolumeNumber(child),
      }))
      .sort((a, b) => b.sortVolume - a.sortVolume)
      .map(({ sortVolume: _sortVolume, ...outcome }) => outcome);
  }

  const yes = yesPrice(market);

  return [
    {
      name: "YES",
      price: yes,
      lastPrice: yes,
      volume: String(market.volumeFormatted ?? market.volume ?? "0"),
      slug: market.slug ?? "",
    },
    {
      name: "NO",
      price: Math.max(0, 1 - yes),
      lastPrice: Math.max(0, 1 - yes),
      volume: String(market.volumeFormatted ?? market.volume ?? "0"),
      slug: market.slug ?? "",
    },
  ];
}

async function fetchActive(params: string) {
  const response = await fetch(
    `https://api.limitless.exchange/markets/active?${params}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("Limitless markets could not be loaded.");
  }

  const data = await response.json();
  return Array.isArray(data.data) ? (data.data as LimitlessMarket[]) : [];
}

async function fetchPages(base: string, pages: number) {
  const results = await Promise.all(
    Array.from({ length: pages }, (_, index) =>
      fetchActive(`${base}&page=${index + 1}&limit=25`),
    ),
  );

  return results.flat();
}

function toCard(market: LimitlessMarket) {
  const yes = yesPrice(market);

  return {
    id: market.id ?? market.slug ?? "",
    title: market.title ?? "Untitled market",
    slug: market.slug ?? "",
    yes,
    no: Math.max(0, 1 - yes),
    volume: String(market.volumeFormatted ?? market.volume ?? "0"),
    expirationDate: market.expirationDate ?? "",
        categories: Array.isArray(market.categories)
      ? market.categories
          .map((item) =>
            typeof item === "string"
              ? item
              : String((item as { name?: unknown })?.name ?? ""),
          )
          .filter(Boolean)
      : [],
    tags: Array.isArray(market.tags)
      ? market.tags
          .map((item) =>
            typeof item === "string"
              ? item
              : String((item as { name?: unknown })?.name ?? ""),
          )
          .filter(Boolean)
      : [],
    properties: (market.properties ?? [])
      .map(
        (item) =>
          `${item.propertyKeySlug ?? ""} ${String(item.value ?? "")}`,
      )
      .filter(Boolean),
    automationType: market.automationType ?? "",
    outcomes: outcomesOf(market),
    url: market.slug
      ? `https://limitless.exchange/markets/${market.slug}`
      : "https://limitless.exchange",
  };
}

export async function GET(request: NextRequest) {
  const field = getField(request.nextUrl.searchParams.get("field"));
  const matchOnly =
    request.nextUrl.searchParams.get("matchOnly") === "true";

  const rawLimit = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Math.min(
    25,
    Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 5),
  );

  try {
    const all = (
      await Promise.all([
        fetchPages("automationType=lumy", 4),
        fetchPages("automationType=sports", 10),
        fetchPages("automationType=manual", 6),
      ])
    ).flat();

    const unique = new Map<string, LimitlessMarket>();

    for (const market of all) {
      const slug = market.slug ?? String(market.id ?? "");
      if (slug) unique.set(slug, market);
    }

    const available = [...unique.values()];
    let selected: LimitlessMarket[];

    if (matchOnly) {
      if (field !== "Sports" && field !== "Esports") {
        return NextResponse.json({ field, matchOnly, markets: [] });
      }

      selected = available.filter((market) => isMatchMarket(market, field));
    } else {
      selected = available.filter((market) => classify(market) === field);

      if (selected.length < 5 && field === "Finance") {
        selected = available.filter(
          (market) =>
            classify(market) === "Finance" ||
            (classify(market) === "Crypto" && !CRYPTO.test(marketText(market))),
        );
      }

      if (selected.length < 5 && field === "Politics") {
        selected = available.filter(
          (market) =>
            classify(market) === "Politics" ||
            classify(market) === "World Events",
        );
      }

      if (selected.length < 5 && field === "World Events") {
        selected = available.filter(
          (market) => classify(market) === "World Events",
        );
      }
    }

    const markets = selected
      .sort((a, b) => volumeNumber(b) - volumeNumber(a))
      .slice(0, limit)
      .map(toCard);

    return NextResponse.json({
      field,
      matchOnly,
      markets,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load live Limitless markets.",
      },
      { status: 500 },
    );
  }
}