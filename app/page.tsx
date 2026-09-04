"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Trophy,
  X,
} from "lucide-react";

type Field =
  | "Crypto"
  | "Sports"
  | "Esports"
  | "Politics"
  | "Finance"
  | "World Events";

type MarketOutcome = {
  name: string;
  price: number;
  lastPrice: number;
  volume: string;
  slug: string;
};

type LiveMarket = {
  id: number | string;
  title: string;
  slug: string;
  yes: number;
  no: number;
  volume: string;
  expirationDate?: string;
  outcomes?: MarketOutcome[];
  url: string;
};

type LiveHeadline = {
  title: string;
  description: string;
  link: string;
  source: string;
  credibility: number;
  publishedAt: string;
  importance: number;
};

type LiveAnalysis = {
  headlineIndex: number;
  marketSlug: string | null;
  marketTitle: string;
  impact: string;
  confidence: number;
  horizon: string;
  analysis: string;
};

type AnalysisItem = {
  headline: LiveHeadline;
  analysis: LiveAnalysis;
};

type MatchItem = {
  name: string;
  competition: string;
  time: string;
  overview: string;
  factors: string[];
  view: string;
  confidence: string;
  outcomes: MarketOutcome[];
  url?: string;
  eventId?: string;
};

type TodayFootballGame = {
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
  results: ("W" | "D" | "L")[];
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
  source: string;
};

type FootballAiAnalysis = {
  summary: string;
  marketContext: string;
  formContext: string;
  headToHeadContext: string;
  caveats: string;
};

const FIELDS: Field[] = [
  "Crypto",
  "Sports",
  "Esports",
  "Politics",
  "Finance",
  "World Events",
];

function formatPrice(value: number) {
  const cents = value * 100;

  return `${cents.toFixed(cents % 1 === 0 ? 0 : 1)}¢`;
}

function formatVolume(value: string) {
  const number = Number(String(value).replace(/,/g, ""));

  if (!Number.isFinite(number)) {
    return value;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(number);
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "Publication time unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatKickoffUtc(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Kickoff time unavailable";
  }

  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date) + " UTC"
  );
}

function marketOutcomes(market: LiveMarket): MarketOutcome[] {
  if (Array.isArray(market.outcomes) && market.outcomes.length > 0) {
    return market.outcomes;
  }

  return [
    {
      name: "YES",
      price: market.yes,
      lastPrice: market.yes,
      volume: market.volume,
      slug: market.slug,
    },
    {
      name: "NO",
      price: market.no,
      lastPrice: market.no,
      volume: market.volume,
      slug: market.slug,
    },
  ];
}

function marketsToGames(field: Field, markets: LiveMarket[]): MatchItem[] {
  return markets.slice(0, 5).map((market) => {
    const outcomes = marketOutcomes(market);
    const leading = [...outcomes].sort((a, b) => b.price - a.price)[0];
    const runnerUp = [...outcomes].sort((a, b) => b.price - a.price)[1];

    const priceSummary = outcomes
      .map((outcome) => `${outcome.name} ${formatPrice(outcome.price)}`)
      .join(" · ");

    const leadText =
      leading && runnerUp
        ? `${leading.name} has the highest current Limitless price at ${formatPrice(
            leading.price,
          )}, followed by ${runnerUp.name} at ${formatPrice(
            runnerUp.price,
          )}. This is a market snapshot, not a prediction.`
        : "Current Limitless prices are shown below. They are market snapshots, not predictions.";

    return {
      name: market.title,
      competition: field,
      time:
        field === "Esports"
          ? `Market volume ${formatVolume(market.volume)} USDC`
          : `Kickoff time unavailable · Volume ${formatVolume(
              market.volume,
            )} USDC`,
      overview: `${market.title} is an active ${field} fixture market on Limitless. Current outcome prices: ${priceSummary}.`,
      factors:
        field === "Esports"
          ? [
              "Official match schedule and series format",
              "Confirmed roster, substitutes, and role changes",
              "Recent series results and map-pool context",
              "Limitless outcome prices and market volume",
            ]
          : [
              "Official fixture schedule",
              "Confirmed starting XI and late team news",
              "Injuries, suspensions, and availability",
              "Recent form, home/away context, and market volume",
            ],
      view: `${leadText} Before relying on market prices, verify the official schedule and the latest team or roster news.`,
      confidence:
        leading && leading.price >= 0.7
          ? "3/5 — one outcome is priced clearly higher, but external evidence must be checked"
          : "2/5 — outcome prices are relatively close or evidence is incomplete",
      outcomes,
      url: market.url,
    };
  });
}

function FormBadges({ results }: { results: FootballForm["results"] }) {
  if (results.length === 0) {
    return <span className="text-sm text-[#a1a49e]">Form unavailable</span>;
  }

  return (
    <div className="flex gap-1.5">
      {results.map((result, index) => (
        <span
          key={`${result}-${index}`}
          className={`grid h-7 w-7 place-items-center rounded-md text-xs font-black ${
            result === "W"
              ? "bg-[#167a42] text-white"
              : result === "D"
                ? "bg-[#d78c18] text-white"
                : "bg-[#b12e3e] text-white"
          }`}
        >
          {result}
        </span>
      ))}
    </div>
  );
}

export default function Home() {
  const [field, setField] = useState<Field>("Crypto");

  const [items, setItems] = useState<AnalysisItem[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState("");

  const [liveMarkets, setLiveMarkets] = useState<LiveMarket[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState("");

  const [gameMarkets, setGameMarkets] = useState<LiveMarket[]>([]);
  const [todayFootballGames, setTodayFootballGames] = useState<
    TodayFootballGame[]
  >([]);
  const [gamesLoading, setGamesLoading] = useState(false);

  const [selectedItem, setSelectedItem] = useState<AnalysisItem | null>(null);
  const [selectedGame, setSelectedGame] = useState<MatchItem | null>(null);
  const [gameDetailLoading, setGameDetailLoading] = useState(false);
  const [gameDetailError, setGameDetailError] = useState("");

  const [footballResearch, setFootballResearch] =
    useState<FootballResearch | null>(null);
  const [footballAiAnalysis, setFootballAiAnalysis] =
    useState<FootballAiAnalysis | null>(null);
  const [footballAiProvider, setFootballAiProvider] = useState("");
  const [footballAiCached, setFootballAiCached] = useState(false);
  const [footballAiLoading, setFootballAiLoading] = useState(false);
  const [footballAiError, setFootballAiError] = useState("");

  const isSport = field === "Sports" || field === "Esports";

  const games: MatchItem[] =
    field === "Sports"
      ? todayFootballGames.map((game) => ({
          name: game.title,
          competition: game.competition,
          time: `${formatKickoffUtc(game.kickoff)} · Volume ${
            game.marketVolumeFormatted
          } USDC`,
          overview: `${game.title} is a verified football fixture scheduled for ${formatKickoffUtc(
            game.kickoff,
          )}. Venue: ${game.venue ?? "Unavailable"}.`,
          factors: [
            "Official fixture schedule",
            "Confirmed starting XI and late team news",
            "Injuries, suspensions, and availability",
            "Recent form, home/away context, and market volume",
          ],
          view: "Live Limitless outcome prices are loaded when you open the match research. Verify the official schedule and team news before relying on any market snapshot.",
          confidence:
            "2/5 — schedule is verified; team-news evidence is not yet included",
          outcomes: [],
          url: game.marketUrl,
          eventId: game.eventId,
        }))
      : field === "Esports"
        ? marketsToGames(field, gameMarkets)
        : [];

  async function openGameResearch(game: MatchItem) {
    setGameDetailLoading(true);
    setGameDetailError("");
    setFootballResearch(null);
    setFootballAiAnalysis(null);
    setFootballAiProvider("");
    setFootballAiCached(false);
    setFootballAiLoading(false);
    setFootballAiError("");
    setSelectedGame(game);

    try {
      const slug = game.url?.split("/markets/")[1];

      if (!slug) {
        throw new Error("This market does not have a valid Limitless slug.");
      }

      const params = new URLSearchParams({ slug });

      if (field === "Sports" && game.eventId) {
        params.set("sportType", "football");
        params.set("eventId", game.eventId);
      }

      const response = await fetch(`/api/markets/detail?${params.toString()}`);
      const detail = await response.json();

      if (!response.ok) {
        throw new Error(
          detail.error || "Unable to load named outcomes for this market.",
        );
      }

      if (!Array.isArray(detail.outcomes) || detail.outcomes.length === 0) {
        throw new Error(
          "Limitless did not return named outcomes for this fixture market.",
        );
      }

      const updatedOutcomes = detail.outcomes as MarketOutcome[];

      const nextFootballResearch =
        field === "Sports" &&
        detail.footballResearch &&
        typeof detail.footballResearch === "object"
          ? (detail.footballResearch as FootballResearch)
          : null;

      setFootballResearch(nextFootballResearch);

      const leading = [...updatedOutcomes].sort(
        (a, b) => b.price - a.price,
      )[0];
      const runnerUp = [...updatedOutcomes].sort(
        (a, b) => b.price - a.price,
      )[1];

      const leadText =
        leading && runnerUp
          ? `${leading.name} currently has the highest Limitless price at ${formatPrice(
              leading.price,
            )}, followed by ${runnerUp.name} at ${formatPrice(
              runnerUp.price,
            )}. This is a market snapshot, not a prediction.`
          : "Live Limitless prices are shown below. They are market snapshots, not predictions.";

      setSelectedGame({
        ...game,
        outcomes: updatedOutcomes,
        overview: `${detail.title} is an active ${field} fixture market on Limitless. Current outcome prices: ${updatedOutcomes
          .map(
            (outcome) =>
              `${outcome.name} ${formatPrice(outcome.price)}`,
          )
          .join(" · ")}.`,
        view: `${leadText} Before relying on market prices, verify the official schedule and the latest team or roster news.`,
        confidence:
          leading && leading.price >= 0.7
            ? "3/5 — one outcome is priced clearly higher, but external evidence must be checked"
            : "2/5 — outcome prices are relatively close or evidence is incomplete",
      });

      if (field === "Sports" && nextFootballResearch) {
        setFootballAiLoading(true);

        try {
          const analysisResponse = await fetch("/api/football/analysis", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              outcomes: updatedOutcomes,
              footballResearch: nextFootballResearch,
            }),
          });

          const analysisData = await analysisResponse.json();

          if (!analysisResponse.ok) {
            throw new Error(
              analysisData.error ||
                "Football analysis is temporarily unavailable.",
            );
          }

          if (
            analysisData.analysis &&
            typeof analysisData.analysis === "object"
          ) {
            setFootballAiAnalysis(
              analysisData.analysis as FootballAiAnalysis,
            );
            setFootballAiProvider(String(analysisData.provider ?? ""));
            setFootballAiCached(Boolean(analysisData.cached));
          } else {
            throw new Error("Football analysis returned no usable result.");
          }
        } catch (error) {
          setFootballAiError(
            error instanceof Error
              ? error.message
              : "Football analysis is temporarily unavailable.",
          );
        } finally {
          setFootballAiLoading(false);
        }
      }
    } catch (error) {
      setGameDetailError(
        error instanceof Error
          ? error.message
          : "Unable to load live market details.",
      );
    } finally {
      setGameDetailLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setAnalysisLoading(true);
      setMarketLoading(true);
      setGamesLoading(isSport);
      setAnalysisError("");
      setMarketError("");
      setGameDetailError("");
      setFootballResearch(null);
      setFootballAiAnalysis(null);
      setFootballAiProvider("");
      setFootballAiCached(false);
      setFootballAiLoading(false);
      setFootballAiError("");
      setSelectedItem(null);
      setSelectedGame(null);

      if (!isSport) {
        setGameMarkets([]);
        setTodayFootballGames([]);
      }

      const fieldParam = encodeURIComponent(field);

      const analysisRequest = fetch(
        `/api/ai/analyze?field=${fieldParam}`,
      );
      const marketRequest = fetch(
        `/api/markets/active?field=${fieldParam}&limit=5`,
      );
      const gamesRequest =
        field === "Sports"
          ? fetch("/api/football/today")
          : field === "Esports"
            ? fetch("/api/markets/active?field=Esports&limit=5&matchOnly=true")
            : Promise.resolve(null);

      const [analysisResult, marketResult, gamesResult] =
        await Promise.allSettled([
          analysisRequest,
          marketRequest,
          gamesRequest,
        ]);

      if (cancelled) {
        return;
      }

      if (analysisResult.status === "fulfilled") {
        const response = analysisResult.value;

        try {
          const data = await response.json();

          if (response.ok) {
            setItems(Array.isArray(data.items) ? data.items : []);
          } else {
            setItems([]);
            setAnalysisError(
              data.error ||
                "Unable to generate the live research brief right now.",
            );
          }
        } catch {
          setItems([]);
          setAnalysisError(
            "Unable to read the live news analysis response right now.",
          );
        }
      } else {
        setItems([]);
        setAnalysisError(
          "Unable to load the live news analysis right now. Please try again later.",
        );
      }

      if (marketResult.status === "fulfilled") {
        const response = marketResult.value;

        try {
          const data = await response.json();

          if (response.ok) {
            setLiveMarkets(Array.isArray(data.markets) ? data.markets : []);
          } else {
            setLiveMarkets([]);
            setMarketError(
              data.error || "Unable to load live Limitless markets.",
            );
          }
        } catch {
          setLiveMarkets([]);
          setMarketError(
            "Unable to read the live Limitless markets response right now.",
          );
        }
      } else {
        setLiveMarkets([]);
        setMarketError(
          "Unable to load live Limitless markets right now. Please try again later.",
        );
      }

      if (field === "Sports") {
        if (gamesResult.status === "fulfilled" && gamesResult.value) {
          const response = gamesResult.value;

          try {
            const data = await response.json();

            setTodayFootballGames(
              response.ok && Array.isArray(data.games) ? data.games : [],
            );
          } catch {
            setTodayFootballGames([]);
          }
        } else {
          setTodayFootballGames([]);
        }

        setGameMarkets([]);
      }

      if (field === "Esports") {
        if (gamesResult.status === "fulfilled" && gamesResult.value) {
          const response = gamesResult.value;

          try {
            const data = await response.json();

            setGameMarkets(
              response.ok && Array.isArray(data.markets) ? data.markets : [],
            );
          } catch {
            setGameMarkets([]);
          }
        } else {
          setGameMarkets([]);
        }

        setTodayFootballGames([]);
      }

      if (!cancelled) {
        setAnalysisLoading(false);
        setMarketLoading(false);
        setGamesLoading(false);
      }
    }

    loadData().catch(() => {
      if (!cancelled) {
        setItems([]);
        setLiveMarkets([]);
        setGameMarkets([]);
        setTodayFootballGames([]);
        setAnalysisError(
          "Unable to load the dashboard right now. Please try again later.",
        );
        setMarketError(
          "Unable to load the dashboard right now. Please try again later.",
        );
        setAnalysisLoading(false);
        setMarketLoading(false);
        setGamesLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [field, isSport]);

  function closeGameModal() {
    setSelectedGame(null);
    setFootballResearch(null);
    setFootballAiAnalysis(null);
    setFootballAiProvider("");
    setFootballAiCached(false);
    setFootballAiLoading(false);
    setFootballAiError("");
    setGameDetailError("");
  }

  return (
    <main className="min-h-screen bg-[#080909] text-[#f4f5f2]">
      <div className="mx-auto max-w-6xl px-5">
        <header className="flex h-20 items-center justify-between border-b border-[#2a2c2b]">
          <div className="flex items-center gap-3">
            <img
              src="/limitless-logo.jpg"
              alt="Limitless logo"
              className="h-11 w-11 rounded-lg object-cover"
            />

            <span className="text-xl font-black tracking-tight">
              LIMITLESS{" "}
              <span className="font-medium text-[#a6aaa4]">RADAR</span>
            </span>
          </div>

          <div className="hidden items-center gap-2 text-xs text-[#a1a49e] sm:flex">
            <span className="h-2 w-2 rounded-full bg-[#c6ff00]" />
            Live research brief
          </div>
        </header>

        <section className="py-7">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            News, context, and market relevance.
          </h1>

          <p className="mt-2 max-w-2xl text-[#a1a49e]">
            Verified headlines, live Limitless market data, and clear English
            analysis for the field you select.
          </p>

          <div className="mt-5 rounded-xl border border-[#4b5722] bg-[#1a2010] px-4 py-3 text-sm text-[#e0efae]">
            <strong>DYOR — Research only.</strong> This dashboard is
            informational, not financial advice and not a recommendation to
            trade. Verify sources and make your own decisions.
          </div>
        </section>

        <nav className="flex gap-2 overflow-x-auto pb-5">
          {FIELDS.map((item) => (
            <button
              key={item}
              onClick={() => setField(item)}
              className={`whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-bold transition ${
                field === item
                  ? "border-[#c6ff00] bg-[#c6ff00] text-[#0b0d04]"
                  : "border-[#2a2c2b] bg-[#121313] text-[#d4d7d2] hover:border-[#63702f]"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        <p className="mb-3 text-xs text-[#a1a49e]">
          {field.toUpperCase()} DESK · Live sources · Updated on demand
        </p>

        <div className="grid gap-5 lg:grid-cols-[1.35fr_.85fr]">
          <div>
            <section className="rounded-2xl border border-[#2a2c2b] bg-[#121313] p-5">
              <div className="mb-4">
                <h2 className="text-base font-bold">Today’s relevant news</h2>

                <p className="mt-1 text-xs text-[#a1a49e]">
                  Every headline is scored, checked against active Limitless
                  markets, and analysed in English.
                </p>
              </div>

              {analysisLoading && (
                <p className="py-5 text-sm text-[#a1a49e]">
                  Loading verified news and generating market analysis…
                </p>
              )}

              {analysisError && (
                <p className="rounded-lg border border-[#74323c] bg-[#271215] px-3 py-3 text-sm text-[#ffb3bd]">
                  {analysisError}
                </p>
              )}

              {!analysisLoading && !analysisError && items.length === 0 && (
                <p className="py-5 text-sm text-[#a1a49e]">
                  No verified headlines are available for this field right now.
                </p>
              )}

              {items.map((item) => (
                <article
                  key={`${item.headline.link}-${item.headline.title}`}
                  className="border-t border-[#2a2c2b] py-5 first:border-t-0 first:pt-0"
                >
                  <h3 className="text-base font-bold leading-snug">
                    {item.headline.title}
                  </h3>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md border border-[#52702a] bg-[#17220e] px-2 py-1 text-[#e5fcb0]">
                      Credibility: {item.headline.credibility}/100
                    </span>

                    <span className="rounded-md border border-[#684d1c] bg-[#231b0b] px-2 py-1 text-[#ffe08a]">
                      Importance: {item.headline.importance}/100
                    </span>

                    <span className="rounded-md border border-[#2a2c2b] px-2 py-1 text-[#d0d4cc]">
                      {item.headline.source}
                    </span>
                  </div>

                  <div className="mt-3 rounded-r-md border-l-4 border-[#c6ff00] bg-[#0e1010] px-3 py-2 text-sm">
                    <strong className="text-[#c6ff00]">May affect:</strong>{" "}
                    {item.analysis.marketTitle}
                    <br />
                    <span className="text-xs text-[#a1a49e]">
                      Potential market effect: {item.analysis.impact}
                    </span>
                  </div>

                  <button
                    onClick={() => setSelectedItem(item)}
                    className="mt-3 flex items-center gap-1 rounded-lg border border-[#3e4e21] bg-[#151c0d] px-3 py-2 text-sm font-bold text-[#c6ff00] hover:bg-[#22310d]"
                  >
                    View in details <ChevronRight size={16} />
                  </button>
                </article>
              ))}
            </section>

            <section className="mt-5 rounded-2xl border border-[#2a2c2b] bg-[#121313] p-5">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 size={18} className="text-[#c6ff00]" />

                <div>
                  <h2 className="text-base font-bold">
                    Highest-volume markets today
                  </h2>

                  <p className="text-xs text-[#a1a49e]">
                    Top five live markets retrieved from Limitless Exchange.
                  </p>
                </div>
              </div>

              {marketLoading && (
                <p className="py-4 text-sm text-[#a1a49e]">
                  Loading live Limitless markets…
                </p>
              )}

              {marketError && (
                <p className="rounded-lg border border-[#74323c] bg-[#271215] px-3 py-3 text-sm text-[#ffb3bd]">
                  {marketError}
                </p>
              )}

              {!marketLoading &&
                !marketError &&
                liveMarkets.length === 0 && (
                  <p className="py-4 text-sm text-[#a1a49e]">
                    No active Limitless markets were found for this field right
                    now.
                  </p>
                )}

              {liveMarkets.slice(0, 5).map((market) => {
                const outcomes = marketOutcomes(market);

                return (
                  <a
                    key={`${market.id}-${market.slug}`}
                    href={market.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block border-t border-[#2a2c2b] py-4 first:border-t-0 first:pt-0 transition hover:opacity-80"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-bold">{market.title}</h3>

                      <ExternalLink
                        size={16}
                        className="mt-0.5 shrink-0 text-[#c6ff00]"
                      />
                    </div>

                    {outcomes.length === 2 &&
                    outcomes[0].name === "YES" &&
                    outcomes[1].name === "NO" ? (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="font-extrabold text-[#c6ff00]">
                          YES {formatPrice(outcomes[0].price)}
                        </span>

                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#393d3a]">
                          <div
                            className="h-full bg-[#c6ff00]"
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(100, outcomes[0].price * 100),
                              )}%`,
                            }}
                          />
                        </div>

                        <span className="font-semibold text-[#c6cac4]">
                          NO {formatPrice(outcomes[1].price)}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {outcomes.map((outcome) => (
                          <span
                            key={`${market.slug}-${outcome.name}`}
                            className="rounded-md border border-[#3e4e21] bg-[#151c0d] px-2 py-1 text-[#d9ef9b]"
                          >
                            {outcome.name} {formatPrice(outcome.price)}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="mt-2 text-xs text-[#a1a49e]">
                      Market volume snapshot: {formatVolume(market.volume)} USDC
                    </p>
                  </a>
                );
              })}
            </section>
          </div>

          <aside>
            {isSport && (
              <section className="rounded-2xl border border-[#2a2c2b] bg-[#121313] p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Trophy size={18} className="text-[#c6ff00]" />

                  <div>
                    <h2 className="text-base font-bold">
                      {field === "Esports"
                        ? "Top Esports fixture markets"
                        : "Important games today"}
                    </h2>

                    <p className="text-xs text-[#a1a49e]">
                      {field === "Esports"
                        ? "Five highest-volume team-versus-team Esports markets on Limitless."
                        : "Today’s football fixtures verified against active Limitless markets."}
                    </p>
                  </div>
                </div>

                {gamesLoading && (
                  <p className="py-4 text-sm text-[#a1a49e]">
                    Finding match markets…
                  </p>
                )}

                {!gamesLoading && games.length === 0 && (
                  <p className="py-4 text-sm text-[#a1a49e]">
                    {field === "Esports"
                      ? "No team-versus-team Esports markets are available on Limitless right now."
                      : "No football fixtures for today were matched with active Limitless markets."}
                  </p>
                )}

                {games.map((game) => (
                  <button
                    key={`${game.name}-${game.url ?? ""}`}
                    onClick={() => openGameResearch(game)}
                    className="w-full border-t border-[#2a2c2b] py-4 text-left first:border-t-0 first:pt-0"
                  >
                    <h3 className="font-bold">{game.name}</h3>

                    <p className="mt-1 text-xs text-[#a1a49e]">
                      {game.competition} · {game.time}
                    </p>

                    <p className="mt-2 flex items-center gap-1 text-sm font-bold text-[#c6ff00]">
                      View match research <ChevronRight size={16} />
                    </p>
                  </button>
                ))}
              </section>
            )}

            <section
              className={`rounded-2xl border border-[#2a2c2b] bg-[#121313] p-5 ${
                isSport ? "mt-5" : ""
              }`}
            >
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck size={18} className="text-[#c6ff00]" />
                <h2 className="text-base font-bold">Understand the scores</h2>
              </div>

              <div className="rounded-xl border border-[#2d3424] bg-[#0c0e0d] p-4 text-sm">
                <div className="flex justify-between gap-4 border-b border-[#2a2c2b] py-2">
                  <span className="text-[#a1a49e]">Credibility</span>
                  <strong>Source reliability</strong>
                </div>

                <div className="flex justify-between gap-4 border-b border-[#2a2c2b] py-2">
                  <span className="text-[#a1a49e]">Importance</span>
                  <strong>Expected market relevance</strong>
                </div>

                <div className="flex justify-between gap-4 py-2">
                  <span className="text-[#a1a49e]">Confidence</span>
                  <strong>Evidence strength</strong>
                </div>

                <p className="mt-3 text-xs text-[#a1a49e]">
                  A high score does not mean the outcome is certain. Always
                  check original sources and do your own research.
                </p>
              </div>
            </section>
          </aside>
        </div>

        <footer className="mt-8 border-t border-[#2a2c2b] py-7 text-center text-xs text-[#a1a49e]">
          Built for{" "}
          <a
            href="https://limitless.exchange?r=PY4N7UMRPX"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-[#c6ff00]"
          >
            limitless.exchange
          </a>

          <br />
          <br />

          Built by FJ |{" "}
          <a
            href="https://x.com/FJnikoo"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-[#c6ff00]"
          >
            @FJnikoo
          </a>
        </footer>
      </div>

      {selectedItem && (
        <Modal onClose={() => setSelectedItem(null)}>
          <p className="text-xs text-[#a1a49e]">
            {field.toUpperCase()} · {selectedItem.headline.source}
          </p>

          <h2 className="mt-2 pr-12 text-2xl font-black leading-tight">
            {selectedItem.headline.title}
          </h2>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-[#52702a] bg-[#17220e] px-2 py-1 text-[#e5fcb0]">
              Credibility: {selectedItem.headline.credibility}/100
            </span>

            <span className="rounded-md border border-[#684d1c] bg-[#231b0b] px-2 py-1 text-[#ffe08a]">
              Importance: {selectedItem.headline.importance}/100
            </span>

            <span className="rounded-md border border-[#2a2c2b] px-2 py-1 text-[#d0d4cc]">
              Published: {formatDate(selectedItem.headline.publishedAt)}
            </span>
          </div>

          <hr className="my-5 border-[#2a2c2b]" />

          <h3 className="font-bold">News summary</h3>
          <p className="mt-2 text-[#d4d7d2]">
            {selectedItem.headline.description}
          </p>

          <a
            href={selectedItem.headline.link}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#a6c3ff] hover:underline"
          >
            Open original source <ExternalLink size={15} />
          </a>

          <h3 className="mt-6 font-bold">Market-impact analysis</h3>

          <div className="mt-3 rounded-xl border border-[#2d3424] bg-[#0c0e0d] p-4 text-sm">
            <DetailRow
              label="Relevant Limitless market"
              value={selectedItem.analysis.marketTitle}
            />

            <DetailRow
              label="Potential effect"
              value={selectedItem.analysis.impact}
              green
            />

            <DetailRow
              label="Analysis confidence"
              value={`${selectedItem.analysis.confidence}/5`}
            />

            <DetailRow
              label="Time horizon"
              value={selectedItem.analysis.horizon}
            />
          </div>

          <h3 className="mt-5 font-bold">Analysis</h3>
          <p className="mt-2 text-[#d4d7d2]">
            {selectedItem.analysis.analysis}
          </p>

          {selectedItem.analysis.marketSlug && (
            <a
              href={`https://limitless.exchange/markets/${selectedItem.analysis.marketSlug}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1 rounded-lg border border-[#3e4e21] bg-[#151c0d] px-3 py-2 text-sm font-bold text-[#c6ff00] hover:bg-[#22310d]"
            >
              Open the relevant Limitless market <ExternalLink size={16} />
            </a>
          )}

          <div className="mt-5 rounded-xl border border-[#4b5722] bg-[#1a2010] px-4 py-3 text-sm text-[#e0efae]">
            <strong>DYOR — Research only.</strong> This analysis is
            informational. It is not financial advice, a prediction, or a trade
            recommendation. Verify sources and decide for yourself.
          </div>
        </Modal>
      )}

      {selectedGame && (
        <Modal onClose={closeGameModal}>
          <p className="text-xs text-[#a1a49e]">
            {field === "Esports"
              ? "ESPORTS FIXTURE MARKET"
              : "IMPORTANT FOOTBALL GAME"}{" "}
            · {selectedGame.competition} · {selectedGame.time}
          </p>

          <h2 className="mt-2 pr-12 text-2xl font-black">
            {selectedGame.name}
          </h2>

          <hr className="my-5 border-[#2a2c2b]" />

          {gameDetailLoading && (
            <p className="rounded-xl border border-[#3e4e21] bg-[#151c0d] px-4 py-3 text-sm text-[#e0efae]">
              Loading verified Limitless market and football context…
            </p>
          )}

          {gameDetailError && (
            <p className="rounded-xl border border-[#74323c] bg-[#271215] px-4 py-3 text-sm text-[#ffb3bd]">
              {gameDetailError}
            </p>
          )}

          <h3 className="mt-5 font-bold">Match research</h3>
          <p className="mt-2 text-[#d4d7d2]">{selectedGame.overview}</p>

          {field === "Sports" && footballResearch && (
            <section className="mt-5">
              <h3 className="font-bold">Verified football context</h3>

              <div className="mt-3 rounded-xl border border-[#2d3424] bg-[#0c0e0d] p-4 text-sm">
                <DetailRow
                  label="Competition"
                  value={
                    [footballResearch.competition, footballResearch.country]
                      .filter(Boolean)
                      .join(" · ") || "Unavailable"
                  }
                />

                <DetailRow
                  label="Round"
                  value={footballResearch.round ?? "Unavailable"}
                />

                <DetailRow
                  label="Venue"
                  value={footballResearch.venue ?? "Unavailable"}
                />

                <DetailRow
                  label="Referee"
                  value={footballResearch.referee ?? "Unavailable"}
                />

                <DetailRow
                  label="Match status"
                  value={footballResearch.status ?? "Unavailable"}
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#3e4e21] bg-[#151c0d] p-4">
                  <p className="text-xs text-[#a1a49e]">
                    {footballResearch.homeForm.teamName ?? "Home team"} ·
                    Recent five
                  </p>

                  <div className="mt-2">
                    <FormBadges results={footballResearch.homeForm.results} />
                  </div>

                  <p className="mt-2 text-xs text-[#d4d7d2]">
                    {footballResearch.homeForm.wins}W ·{" "}
                    {footballResearch.homeForm.draws}D ·{" "}
                    {footballResearch.homeForm.losses}L
                  </p>
                </div>

                <div className="rounded-xl border border-[#3e4e21] bg-[#151c0d] p-4">
                  <p className="text-xs text-[#a1a49e]">
                    {footballResearch.awayForm.teamName ?? "Away team"} ·
                    Recent five
                  </p>

                  <div className="mt-2">
                    <FormBadges results={footballResearch.awayForm.results} />
                  </div>

                  <p className="mt-2 text-xs text-[#d4d7d2]">
                    {footballResearch.awayForm.wins}W ·{" "}
                    {footballResearch.awayForm.draws}D ·{" "}
                    {footballResearch.awayForm.losses}L
                  </p>
                </div>
              </div>

              <h4 className="mt-5 text-sm font-bold">
                Head-to-head — last five
              </h4>

              {footballResearch.headToHead.length === 0 ? (
                <p className="mt-2 text-sm text-[#a1a49e]">
                  No head-to-head results were returned by Limitless.
                </p>
              ) : (
                <div className="mt-2 overflow-hidden rounded-xl border border-[#2d3424]">
                  {footballResearch.headToHead.map((match) => (
                    <div
                      key={`${match.fixtureId ?? "fixture"}-${
                        match.dateUtc ?? "date"
                      }`}
                      className="border-b border-[#2a2c2b] px-3 py-3 text-sm last:border-b-0"
                    >
                      <p className="text-xs text-[#a1a49e]">
                        {match.dateUtc
                          ? formatDate(match.dateUtc)
                          : "Date unavailable"}{" "}
                        · {match.leagueName ?? "Competition unavailable"}
                      </p>

                      <p className="mt-1 font-semibold">
                        {match.homeTeam ?? "Home"} {match.homeGoals ?? "–"} –{" "}
                        {match.awayGoals ?? "–"}{" "}
                        {match.awayTeam ?? "Away"}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-3 text-xs text-[#a1a49e]">
                Form, venue, referee, and head-to-head data are supplied by the
                Limitless football event feed. They provide context only and
                are not a prediction or recommendation.
              </p>
            </section>
          )}

          {field === "Sports" && footballResearch && (
            <section className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">Football research analysis</h3>

                {(footballAiProvider || footballAiCached) && (
                  <span className="rounded-md border border-[#3e4e21] bg-[#151c0d] px-2 py-1 text-xs text-[#d9ef9b]">
                    {footballAiProvider || "Limitless analysis"}
                    {footballAiCached ? " · Cached" : ""}
                  </span>
                )}
              </div>

              {footballAiLoading && (
                <p className="mt-3 rounded-xl border border-[#3e4e21] bg-[#151c0d] px-4 py-3 text-sm text-[#e0efae]">
                  Analysing verified football and Limitless market data…
                </p>
              )}

              {footballAiError && (
                <p className="mt-3 rounded-xl border border-[#74323c] bg-[#271215] px-4 py-3 text-sm text-[#ffb3bd]">
                  {footballAiError}
                </p>
              )}

              {footballAiAnalysis && (
                <div className="mt-3 rounded-xl border border-[#3e4e21] bg-[#151c0d] p-4 text-sm">
                  <p className="font-semibold text-[#e4f8ba]">
                    {footballAiAnalysis.summary}
                  </p>

                  <div className="mt-4 space-y-3 text-[#d4d7d2]">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-[#a1a49e]">
                        Market context
                      </p>
                      <p className="mt-1">
                        {footballAiAnalysis.marketContext}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-[#a1a49e]">
                        Recent form
                      </p>
                      <p className="mt-1">
                        {footballAiAnalysis.formContext}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-[#a1a49e]">
                        Head-to-head
                      </p>
                      <p className="mt-1">
                        {footballAiAnalysis.headToHeadContext}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-[#a1a49e]">
                        Limits
                      </p>
                      <p className="mt-1">
                        {footballAiAnalysis.caveats}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!footballAiLoading &&
                !footballAiError &&
                !footballAiAnalysis && (
                  <p className="mt-3 text-sm text-[#a1a49e]">
                    Football analysis is not available for this fixture yet.
                  </p>
                )}
            </section>
          )}

          <h3 className="mt-5 font-bold">Live Limitless outcome prices</h3>

          {selectedGame.outcomes.length === 0 ? (
            <p className="mt-3 text-sm text-[#a1a49e]">
              Loading named outcomes from Limitless…
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {selectedGame.outcomes.map((outcome) => (
                <div
                  key={`${selectedGame.name}-${outcome.name}`}
                  className="rounded-xl border border-[#3e4e21] bg-[#151c0d] p-3"
                >
                  <p className="text-xs text-[#a1a49e]">{outcome.name}</p>

                  <p className="mt-1 text-lg font-black text-[#c6ff00]">
                    {formatPrice(outcome.price)}
                  </p>

                  <p className="mt-1 text-xs text-[#a1a49e]">
                    Last: {formatPrice(outcome.lastPrice)}
                  </p>
                </div>
              ))}
            </div>
          )}

          <h3 className="mt-5 font-bold">What to verify</h3>

          <ul className="mt-2 list-inside list-disc text-[#d4d7d2]">
            {selectedGame.factors.map((factor) => (
              <li key={factor}>{factor}</li>
            ))}
          </ul>

          <div className="mt-5 rounded-xl bg-[#1a2110] p-4 text-sm text-[#e4f8ba]">
            <strong>Current research view: {selectedGame.view}</strong>
            <br />
            Analysis confidence: {selectedGame.confidence}
          </div>

          {selectedGame.url && (
            <a
              href={selectedGame.url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1 rounded-lg border border-[#3e4e21] bg-[#151c0d] px-3 py-2 text-sm font-bold text-[#c6ff00] hover:bg-[#22310d]"
            >
              Open Limitless market <ExternalLink size={16} />
            </a>
          )}

          <div className="mt-5 rounded-xl border border-[#4b5722] bg-[#1a2010] px-4 py-3 text-sm text-[#e0efae]">
            <strong>DYOR — Research only.</strong> This is an analytical view,
            not financial advice or a betting recommendation. Check current
            team news and decide for yourself.
          </div>
        </Modal>
      )}
    </main>
  );
}

function DetailRow({
  label,
  value,
  green = false,
}: {
  label: string;
  value: string;
  green?: boolean;
}) {
  return (
    <div className="flex justify-between gap-5 border-b border-[#2a2c2b] py-2 last:border-b-0">
      <span className="text-[#a1a49e]">{label}</span>
      <strong className={green ? "text-[#c6ff00]" : ""}>{value}</strong>
    </div>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#3a3e3b] bg-[#151716] p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg bg-[#2d312e] p-2 text-white hover:bg-[#414640]"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {children}
      </div>
    </div>
  );
}