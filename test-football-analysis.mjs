const response = await fetch("http://localhost:3000/api/football/analysis", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    outcomes: [
      {
        name: "Burnley",
        price: 0.35,
        lastPrice: 0.335,
        volume: "1.472000",
      },
      {
        name: "Middlesbrough",
        price: 0.417,
        lastPrice: 0.3985,
        volume: "572.014081",
      },
      {
        name: "Draw",
        price: 0.285,
        lastPrice: 0.265,
        volume: "8.710000",
      },
    ],
    footballResearch: {
      eventId: "1563127",
      competition: "Championship",
      country: "England",
      round: "Regular Season - 4",
      kickoff: "2026-09-02T19:00:00.000Z",
      status: "Not Started",
      venue: "Turf Moor, Burnley",
      referee: "M. Donohue",
      homeTeam: "Burnley",
      awayTeam: "Middlesbrough",
      homeForm: {
        teamName: "Burnley",
        results: ["D", "D", "L", "D", "L"],
        wins: 0,
        draws: 3,
        losses: 2,
      },
      awayForm: {
        teamName: "Middlesbrough",
        results: ["W", "W", "L", "W", "W"],
        wins: 4,
        draws: 0,
        losses: 1,
      },
      headToHead: [
        {
          fixtureId: 1216123,
          dateUtc: "2024-12-29T20:00:00+00:00",
          leagueName: "Championship",
          homeTeam: "Middlesbrough",
          awayTeam: "Burnley",
          homeGoals: 0,
          awayGoals: 0,
        },
        {
          fixtureId: 1216059,
          dateUtc: "2024-12-06T20:00:00+00:00",
          leagueName: "Championship",
          homeTeam: "Burnley",
          awayTeam: "Middlesbrough",
          homeGoals: 1,
          awayGoals: 1,
        },
        {
          fixtureId: 881189,
          dateUtc: "2023-04-07T19:00:00+00:00",
          leagueName: "Championship",
          homeTeam: "Middlesbrough",
          awayTeam: "Burnley",
          homeGoals: 1,
          awayGoals: 2,
        },
      ],
    },
  }),
});

console.log(await response.json());