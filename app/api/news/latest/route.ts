
import { NextRequest, NextResponse } from "next/server";
import {
  acquireFootballRefreshLock,
  readFootballCache,
  releaseFootballRefreshLock,
  writeFootballCache,
} from "@/lib/football-cache";

export const runtime = "nodejs";

type Field =
  | "Crypto"
  | "Sports"
  | "Esports"
  | "Politics"
  | "Finance"
  | "World Events";

const FIELDS: Field[] = [
  "Crypto",
  "Sports",
  "Esports",
  "Politics",
  "Finance",
  "World Events",
];

const FEEDS: Record<Field, string[]> = {
  Crypto: [
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://news.google.com/rss/search?q=bitcoin+OR+ethereum+OR+cryptocurrency&hl=en-US&gl=US&ceid=US:en",
  ],
  Sports: [
    "https://feeds.bbci.co.uk/sport/football/rss.xml",
    "https://feeds.bbci.co.uk/sport/rss.xml",
  ],
  Esports: [
    "https://news.google.com/rss/search?q=esports+OR+CS2+OR+Valorant+OR+%22League+of+Legends%22+OR+Dota&hl=en-US&gl=US&ceid=US:en",
  ],
  Politics: [
    "https://feeds.bbci.co.uk/news/politics/rss.xml",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://news.google.com/rss/search?q=election+OR+president+OR+politics&hl=en-US&gl=US&ceid=US:en",
  ],
  Finance: [
    "https://feeds.bbci.co.uk/news/business/rss.xml",
    "https://news.google.com/rss/search?q=stock+market+OR+Federal+Reserve+OR+inflation+OR+Nasdaq&hl=en-US&gl=US&ceid=US:en",
  ],
  "World Events": [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://news.google.com/rss/search?q=world+news+OR+international+crisis&hl=en-US&gl=US&ceid=US:en",
  ],
};
type NewsResponse = {
  field: Field;
  headlines: Array<{
    title: string;
    description: string;
    link: string;
    source: string;
    credibility: number;
    publishedAt: string;
    importance: number;
  }>;
};

const NEWS_CACHE_MS: Record<Field, number> = {
  Crypto: 10 * 60 * 1000,
  Sports: 10 * 60 * 1000,
  Esports: 10 * 60 * 1000,
  Politics: 15 * 60 * 1000,
  Finance: 10 * 60 * 1000,
  "World Events": 15 * 60 * 1000,
};

function newsResponse(
  value: NewsResponse,
  options: {
    cached: boolean;
    stale: boolean;
    updatedAt: string | null;
  },
) {
  return NextResponse.json(
    {
      ...value,
      ...options,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
function getField(value: string | null): Field {
  return FIELDS.includes(value as Field) ? (value as Field) : "Crypto";
}

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&hellip;/gi, "…")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string) {
  const match = block.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"),
  );
  return match ? decode(match[1]) : "";
}

function sourceName(title: string, source: string) {
  const fromTitle = title.split(" - ").at(-1)?.trim();
  return source || fromTitle || "Unknown source";
}

function credibility(source: string) {
  const key = source.toLowerCase();
  if (key.includes("reuters") || key.includes("associated press")) return 92;
  if (key.includes("bbc")) return 90;
  if (key.includes("bloomberg") || key.includes("financial times")) return 88;
  if (key.includes("coindesk")) return 82;
  if (key.includes("guardian")) return 86;
  return 72;
}

function importance(title: string, field: Field) {
  const text = title.toLowerCase();
  let score = 60;
  if (field === "Crypto" && /bitcoin|ethereum|sec|etf|hack/.test(text)) score += 18;
  if (field === "Sports" && /final|injury|transfer|champions/.test(text)) score += 16;
  if (field === "Esports" && /major|worlds|final|roster/.test(text)) score += 16;
  if (field === "Politics" && /election|war|president|sanctions/.test(text)) score += 18;
  if (field === "Finance" && /fed|inflation|jobs|rate/.test(text)) score += 18;
  if (field === "World Events" && /war|earthquake|ceasefire/.test(text)) score += 18;
  return Math.max(1, Math.min(100, score));
}

async function readFeed(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return [];
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((item) => item[1]);
}
async function buildNews(field: Field): Promise<NewsResponse> {
  const blocks = (await Promise.all(FEEDS[field].map(readFeed))).flat();
  const seen = new Set<string>();
  const headlines: NewsResponse["headlines"] = [];

  for (const block of blocks) {
    const title = tag(block, "title");

    if (!title || seen.has(title.toLowerCase())) {
      continue;
    }

    seen.add(title.toLowerCase());

    const source = sourceName(title, tag(block, "source"));

    headlines.push({
      title,
      description:
        decode(tag(block, "description").replace(/<[^>]+>/g, "")) || title,
      link: tag(block, "link"),
      source,
      credibility: credibility(source),
      publishedAt: tag(block, "pubDate"),
      importance: importance(title, field),
    });

    if (headlines.length >= 8) {
      break;
    }
  }

  return {
    field,
    headlines,
  };
}
export async function GET(request: NextRequest) {
  const field = getField(request.nextUrl.searchParams.get("field"));
  const cacheKey = `limitless-radar:news:v1:${field
    .toLowerCase()
    .replace(/\s+/g, "-")}`;
  const lockKey = `${cacheKey}:refresh-lock`;
  const freshForMs = NEWS_CACHE_MS[field];
  const staleForMs = 6 * 60 * 60 * 1000;

  const cached = await readFootballCache<NewsResponse>(cacheKey);

  if (cached.status === "fresh") {
    return newsResponse(cached.value.value, {
      cached: true,
      stale: false,
      updatedAt: cached.value.updatedAt,
    });
  }

  if (cached.status === "stale") {
    const locked = await acquireFootballRefreshLock(lockKey, 30);

    if (!locked) {
      return newsResponse(cached.value.value, {
        cached: true,
        stale: true,
        updatedAt: cached.value.updatedAt,
      });
    }

    try {
      const value = await buildNews(field);

      const saved = await writeFootballCache(
        cacheKey,
        value,
        freshForMs,
        staleForMs,
      );

      return newsResponse(value, {
        cached: false,
        stale: false,
        updatedAt: saved?.updatedAt ?? new Date().toISOString(),
      });
    } catch (error) {
      console.error("News refresh failed; serving stale cache:", error);

      return newsResponse(cached.value.value, {
        cached: true,
        stale: true,
        updatedAt: cached.value.updatedAt,
      });
    } finally {
      await releaseFootballRefreshLock(lockKey);
    }
  }

  const locked = await acquireFootballRefreshLock(lockKey, 30);

  if (!locked) {
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const retryCache = await readFootballCache<NewsResponse>(cacheKey);

    if (retryCache.status === "fresh" || retryCache.status === "stale") {
      return newsResponse(retryCache.value.value, {
        cached: true,
        stale: retryCache.status === "stale",
        updatedAt: retryCache.value.updatedAt,
      });
    }

    return NextResponse.json(
      {
        field,
        headlines: [],
        cached: true,
        stale: true,
        updatedAt: null,
        message: "News is being prepared. Please try again shortly.",
      },
      {
        status: 202,
        headers: {
          "Retry-After": "2",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const value = await buildNews(field);

    const saved = await writeFootballCache(
      cacheKey,
      value,
      freshForMs,
      staleForMs,
    );

    return newsResponse(value, {
      cached: false,
      stale: false,
      updatedAt: saved?.updatedAt ?? new Date().toISOString(),
    });
  } catch (error) {
    console.error("News route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load verified headlines.",
      },
      { status: 500 },
    );
  } finally {
    await releaseFootballRefreshLock(lockKey);
  }
}