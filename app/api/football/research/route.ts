import { NextRequest, NextResponse } from "next/server";
import {
  acquireFootballRefreshLock,
  readFootballCache,
  releaseFootballRefreshLock,
  writeFootballCache,
} from "@/lib/football-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiFootballTeam = {
  id: number;
  name: string;
};

type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
    venue?: {
      name?: string | null;
      city?: string | null;
    };
  };
  league: {
    id: number;
    name: string;
    country?: string | null;
    season: number;
  };
  teams: {
    home: ApiFootballTeam;
    away: ApiFootballTeam;
  };
};

type ApiFootballResult = {
  fixture: {
    id: number;
    date: string;
  };
  teams: {
    home: ApiFootballTeam;
    away: ApiFootballTeam;
  };
  goals: {
    home: number | null;
    away: number | null;
  };
};

type FormSummary = {
  sequence: ("W" | "D" | "L")[];
  wins: number;
  draws: number;
  losses: number;
  played: number;
  available: boolean;
};

function apiFootballHeaders() {
  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    throw new Error("API_FOOTBALL_KEY is missing from environment variables.");
  }

  return {
    "x-apisports-key": apiKey,
  };
}

async function apiFootballFetch<T>(path: string): Promise<T> {
  const response = await fetch(`https://v3.football.api-sports.io${path}`, {
    headers: apiFootballHeaders(),
    cache: "no-store",
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      body?.message ||
        body?.errors?.token ||
        "API-Football request failed.",
    );
  }

    if (body?.errors && Object.keys(body.errors).length > 0) {
    console.error("API-Football response errors:", path, body.errors);
    throw new Error(JSON.stringify(body.errors));
  }
  return body as T;
}

function resultForTeam(
  match: ApiFootballResult,
  teamId: number,
): "W" | "D" | "L" | null {
  const homeGoals = match.goals.home;
  const awayGoals = match.goals.away;

  if (
    homeGoals === null ||
    awayGoals === null ||
    homeGoals === undefined ||
    awayGoals === undefined
  ) {
    return null;
  }

  const teamIsHome = match.teams.home.id === teamId;
  const teamGoals = teamIsHome ? homeGoals : awayGoals;
  const opponentGoals = teamIsHome ? awayGoals : homeGoals;

  if (teamGoals > opponentGoals) {
    return "W";
  }

  if (teamGoals < opponentGoals) {
    return "L";
  }

  return "D";
}

function summarizeForm(
  matches: ApiFootballResult[],
  teamId: number,
): FormSummary {
  const sequence = matches
    .map((match) => resultForTeam(match, teamId))
    .filter((result): result is "W" | "D" | "L" => result !== null)
    .slice(0, 5);

    return {
    sequence,
    wins: sequence.filter((result) => result === "W").length,
    draws: sequence.filter((result) => result === "D").length,
    losses: sequence.filter((result) => result === "L").length,
    played: sequence.length,
    available: true,
  };
}

function unavailableForm(): FormSummary {
  return {
    sequence: [],
    wins: 0,
    draws: 0,
    losses: 0,
    played: 0,
    available: false,
  };
}

function unavailableWinRate() {
  return {
    played: 0,
    wins: 0,
    rate: null,
    available: false,
  };
}

function calculateWinRate(
  history: ApiFootballResult[],
  teamId: number,
  venue: "home" | "away",
): {
  played: number;
  wins: number;
  rate: number | null;
  available: boolean;
} {
  const venueMatches = history.filter(
    (match) => match.teams[venue]?.id === teamId,
  );

  const played = venueMatches.length;
  const wins = venueMatches.filter((match) => {
    const teamGoals = match.goals[venue] ?? 0;
    const opponentGoals = match.goals[venue === "home" ? "away" : "home"] ?? 0;
    return teamGoals > opponentGoals;
  }).length;

  const rate = played > 0 ? wins / played : null;

  return {
    played,
    wins,
    rate,
    available: true,
  };
}

function sortNewestFirst(matches: ApiFootballResult[]) {
  return [...matches].sort(
    (a, b) =>
      new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime(),
  );
}

export async function GET(request: NextRequest) {
  const fixtureId = Number(
    request.nextUrl.searchParams.get("fixtureId") ?? "",
  );

  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    return NextResponse.json(
      { error: "A valid numeric fixtureId is required." },
      { status: 400 },
    );
  }

  const cacheKey = `limitless-radar:football:research:v1:${fixtureId}`;
  const lockKey = `${cacheKey}:refresh-lock`;
  const freshForMs = 60 * 60 * 1000;
  const staleForMs = 48 * 60 * 60 * 1000;

    type ResearchValue = {
    fixtureId: number;
    fixture: {
      kickoff: string;
      competition: string;
      country: string | null;
      season: number;
      venue: string | null;
      city: string | null;
      homeTeam: ApiFootballTeam;
      awayTeam: ApiFootballTeam;
    };
    home: {
      team: ApiFootballTeam;
      recentForm: FormSummary;
      homeWinRate: {
        played: number;
        wins: number;
        rate: number | null;
        available: boolean;
      };
    };
    away: {
      team: ApiFootballTeam;
      recentForm: FormSummary;
      awayWinRate: {
        played: number;
        wins: number;
        rate: number | null;
        available: boolean;
      };
    };
    sampleNote: string;
  };

  const send = (
    value: ResearchValue,
    options: {
      cached: boolean;
      stale: boolean;
      updatedAt: string | null;
    },
  ) =>
    NextResponse.json(
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

  const buildResearch = async (): Promise<ResearchValue> => {
    const fixtureData = await apiFootballFetch<{
      response: ApiFootballFixture[];
    }>(`/fixtures?id=${fixtureId}`);

    const fixture = fixtureData.response?.[0];

    if (!fixture) {
      throw new Error("Football fixture not found.");
    }

    const season = fixture.league.season;
    const leagueId = fixture.league.id;
    const homeTeam = fixture.teams.home;
    const awayTeam = fixture.teams.away;

        let homeHistory: ApiFootballResult[] = [];
    let awayHistory: ApiFootballResult[] = [];
    let historyAvailable = true;

    try {
      const [homeHistoryData, awayHistoryData] = await Promise.all([
        apiFootballFetch<{ response: ApiFootballResult[] }>(
          `/fixtures?team=${homeTeam.id}&league=${leagueId}&season=${season}&last=20`,
        ),
        apiFootballFetch<{ response: ApiFootballResult[] }>(
          `/fixtures?team=${awayTeam.id}&league=${leagueId}&season=${season}&last=20`,
        ),
      ]);

      homeHistory = sortNewestFirst(homeHistoryData.response ?? []).filter(
        (match) => match.fixture.id !== fixtureId,
      );

      awayHistory = sortNewestFirst(awayHistoryData.response ?? []).filter(
        (match) => match.fixture.id !== fixtureId,
      );
    } catch (error) {
      historyAvailable = false;
      console.warn(
        "Football history is unavailable for this fixture; returning fixture details only.",
        error,
      );
    }

    const homeForm = historyAvailable
      ? summarizeForm(homeHistory, homeTeam.id)
      : unavailableForm();

    const awayForm = historyAvailable
      ? summarizeForm(awayHistory, awayTeam.id)
      : unavailableForm();

    const homeVenueRate = historyAvailable
      ? calculateWinRate(homeHistory, homeTeam.id, "home")
      : unavailableWinRate();

    const awayVenueRate = historyAvailable
      ? calculateWinRate(awayHistory, awayTeam.id, "away")
      : unavailableWinRate();

    return {
      fixtureId,
      fixture: {
        kickoff: fixture.fixture.date,
        competition: fixture.league.name,
        country: fixture.league.country ?? null,
        season,
        venue: fixture.fixture.venue?.name ?? null,
        city: fixture.fixture.venue?.city ?? null,
        homeTeam,
        awayTeam,
      },
      home: {
        team: homeTeam,
        recentForm: homeForm,
        homeWinRate: homeVenueRate,
      },
      away: {
        team: awayTeam,
        recentForm: awayForm,
        awayWinRate: awayVenueRate,
      },
            sampleNote: historyAvailable
        ? "Form and venue win rates use completed league fixtures from the current season, excluding the selected fixture."
        : "Current-season form data is unavailable on the configured football API plan. Fixture details are still shown.",
    };
  };

  const cached = await readFootballCache<ResearchValue>(cacheKey);

  if (cached.status === "fresh") {
    return send(cached.value.value, {
      cached: true,
      stale: false,
      updatedAt: cached.value.updatedAt,
    });
  }

  if (cached.status === "stale") {
    const locked = await acquireFootballRefreshLock(lockKey);

    if (!locked) {
      return send(cached.value.value, {
        cached: true,
        stale: true,
        updatedAt: cached.value.updatedAt,
      });
    }

    try {
      const value = await buildResearch();
      const saved = await writeFootballCache(
        cacheKey,
        value,
        freshForMs,
        staleForMs,
      );

      return send(value, {
        cached: false,
        stale: false,
        updatedAt: saved?.updatedAt ?? new Date().toISOString(),
      });
    } catch (error) {
      console.error("Football research refresh failed; serving stale cache:", error);

      return send(cached.value.value, {
        cached: true,
        stale: true,
        updatedAt: cached.value.updatedAt,
      });
    } finally {
      await releaseFootballRefreshLock(lockKey);
    }
  }

  const locked = await acquireFootballRefreshLock(lockKey);

  if (!locked) {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const retryCache = await readFootballCache<ResearchValue>(cacheKey);

    if (retryCache.status === "fresh" || retryCache.status === "stale") {
      return send(retryCache.value.value, {
        cached: true,
        stale: retryCache.status === "stale",
        updatedAt: retryCache.value.updatedAt,
      });
    }

    return NextResponse.json(
      {
        fixtureId,
        cached: true,
        stale: true,
        updatedAt: null,
        message: "Football research is being prepared. Please check back shortly.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const value = await buildResearch();
    const saved = await writeFootballCache(
      cacheKey,
      value,
      freshForMs,
      staleForMs,
    );

    return send(value, {
      cached: false,
      stale: false,
      updatedAt: saved?.updatedAt ?? new Date().toISOString(),
    });
  } catch (error) {
    console.error("Football research route error:", error);

    return NextResponse.json(
      {
        fixtureId,
        error: "Football research is temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  } finally {
    await releaseFootballRefreshLock(lockKey);
  }
}