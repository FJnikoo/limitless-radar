import { NextRequest, NextResponse } from "next/server";

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

function getField(value: string | null): Field {
  return FIELDS.includes(value as Field) ? (value as Field) : "Crypto";
}

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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

export async function GET(request: NextRequest) {
  const field = getField(request.nextUrl.searchParams.get("field"));

  try {
    const blocks = (await Promise.all(FEEDS[field].map(readFeed))).flat();
    const seen = new Set<string>();
    const headlines = [];

    for (const block of blocks) {
      const title = tag(block, "title");
      if (!title || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());

      const source = sourceName(title, tag(block, "source"));
      headlines.push({
        title,
        description:
          tag(block, "description").replace(/<[^>]+>/g, "") || title,
        link: tag(block, "link"),
        source,
        credibility: credibility(source),
        publishedAt: tag(block, "pubDate"),
        importance: importance(title, field),
      });

      if (headlines.length >= 8) break;
    }

    return NextResponse.json({ field, headlines });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load verified headlines.",
      },
      { status: 500 },
    );
  }
}