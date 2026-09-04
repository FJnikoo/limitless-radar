import { NextRequest, NextResponse } from "next/server";

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
  };
}

function calculateWinRate(
  matches: ApiFootballResult[],
  teamId: number,
  venue: "home" | "away",
) {
  const relevantMatches = matches.filter((match) =>
    venue === "home"
      ? match.teams.home.id === teamId
      : match.teams.away.id === teamId,
  );

  const completedMatches = relevantMatches.filter(
    (match) =>
      match.goals.home !== null &&
      match.goals.away !== null &&
      match.goals.home !== undefined &&
      match.goals.away !== undefined,
  );

  const wins = completedMatches.filter(
    (match) => resultForTeam(match, teamId) === "W",
  ).length;

  return {
    played: completedMatches.length,
    wins,
    rate:
      completedMatches.length > 0
        ? Math.round((wins / completedMatches.length) * 100)
        : null,
  };
}

function sortNewestFirst(matches: ApiFootballResult[]) {
  return [...matches].sort(
    (a, b) =>
      new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime(),
  );
}

export async function GET(request: NextRequest) {
  try {
    const fixtureId = Number(
      request.nextUrl.searchParams.get("fixtureId") ?? "",
    );

    if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
      return NextResponse.json(
        { error: "A valid numeric fixtureId is required." },
        { status: 400 },
      );
    }

    const fixtureData = await apiFootballFetch<{
      response: ApiFootballFixture[];
    }>(`/fixtures?id=${fixtureId}`);

    const fixture = fixtureData.response?.[0];

    if (!fixture) {
      return NextResponse.json(
        { error: "Football fixture not found." },
        { status: 404 },
      );
    }

    const season = fixture.league.season;
    const leagueId = fixture.league.id;
    const homeTeam = fixture.teams.home;
    const awayTeam = fixture.teams.away;

    const [homeHistoryData, awayHistoryData] = await Promise.all([
      apiFootballFetch<{ response: ApiFootballResult[] }>(
        `/fixtures?team=${homeTeam.id}&league=${leagueId}&season=${season}&last=20`,
      ),
      apiFootballFetch<{ response: ApiFootballResult[] }>(
        `/fixtures?team=${awayTeam.id}&league=${leagueId}&season=${season}&last=20`,
      ),
    ]);

    const homeHistory = sortNewestFirst(homeHistoryData.response ?? []).filter(
      (match) => match.fixture.id !== fixtureId,
    );

    const awayHistory = sortNewestFirst(awayHistoryData.response ?? []).filter(
      (match) => match.fixture.id !== fixtureId,
    );

    const homeForm = summarizeForm(homeHistory, homeTeam.id);
    const awayForm = summarizeForm(awayHistory, awayTeam.id);

    const homeVenueRate = calculateWinRate(
      homeHistory,
      homeTeam.id,
      "home",
    );

    const awayVenueRate = calculateWinRate(
      awayHistory,
      awayTeam.id,
      "away",
    );

    return NextResponse.json({
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
      sampleNote:
        "Form and venue win rates use completed league fixtures from the current season, excluding the selected fixture.",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load football research.",
      },
      { status: 500 },
    );
  }
}