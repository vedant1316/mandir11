import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import * as tournamentEngine from '../engines/tournamentEngine';
import {
  TournamentValidationError,
  TournamentNotFoundError,
  FixtureNotFoundError,
} from '../engines/errors';

describe('TournamentEngine & Fixtures (IndexedDB Local-First)', () => {
  beforeEach(async () => {
    await db.players.clear();
    await db.matches.clear();
    await db.teams.clear();
    await db.team_players.clear();
    await db.match_results.clear();
    await db.tournaments.clear();
    await db.fixtures.clear();
  });

  async function createPlayerRoster() {
    const p1 = await playerService.create('Virat');
    const p2 = await playerService.create('Rohit');
    const p3 = await playerService.create('Bumrah');
    const p4 = await playerService.create('Shami');
    return { p1, p2, p3, p4 };
  }

  // ── 1. Tournament Creation & Validation ────────────────────────

  it('creates a tournament for cricket, volleyball, or badminton with valid teams', async () => {
    const { p1, p2, p3, p4 } = await createPlayerRoster();

    const tournament = await tournamentEngine.createTournament({
      name: 'Colony Cup 2026',
      sport: 'volleyball',
      format: 'knockout',
      teams: [
        { name: 'Royal Strikers', player_ids: [p1.id, p2.id] },
        { name: 'Super Smashers', player_ids: [p3.id, p4.id] },
      ],
    });

    expect(tournament.id).toBeDefined();
    expect(tournament.name).toBe('Colony Cup 2026');
    expect(tournament.sport).toBe('volleyball');
    expect(tournament.format).toBe('knockout');
    expect(tournament.status).toBe('upcoming');
    expect(tournament.teams.length).toBe(2);
    expect(tournament.fixtures.length).toBe(1);
    expect(tournament.fixtures[0].round_label).toBe('Final');
    expect(tournament.fixtures[0].status).toBe('ready');
  });

  it('rejects tournament creation with invalid sport or duplicate team names', async () => {
    const { p1, p2 } = await createPlayerRoster();

    // Invalid sport
    await expect(
      tournamentEngine.createTournament({
        name: 'Tennis Open',
        sport: 'tennis',
        format: 'knockout',
        teams: [
          { name: 'Team A', player_ids: [p1.id] },
          { name: 'Team B', player_ids: [p2.id] },
        ],
      })
    ).rejects.toThrow(TournamentValidationError);

    // Duplicate team names
    await expect(
      tournamentEngine.createTournament({
        name: 'Cup',
        sport: 'cricket',
        format: 'knockout',
        teams: [
          { name: 'Team A', player_ids: [p1.id] },
          { name: 'Team A', player_ids: [p2.id] },
        ],
      })
    ).rejects.toThrow(TournamentValidationError);
  });

  // ── 2. Knockout Fixture Generation (4 Teams) ───────────────────

  it('generates knockout bracket with 2 Semi-Finals and 1 Final linking winners', async () => {
    const { p1, p2, p3, p4 } = await createPlayerRoster();

    const tournament = await tournamentEngine.createTournament({
      name: 'Colony 4-Team Knockout',
      sport: 'volleyball',
      format: 'knockout',
      teams: [
        { name: 'Team A', player_ids: [p1.id] },
        { name: 'Team B', player_ids: [p2.id] },
        { name: 'Team C', player_ids: [p3.id] },
        { name: 'Team D', player_ids: [p4.id] },
      ],
    });

    expect(tournament.fixtures.length).toBe(3);

    const sf1 = tournament.fixtures.find((f) => f.round_label === 'Semi-Final 1');
    const sf2 = tournament.fixtures.find((f) => f.round_label === 'Semi-Final 2');
    const final = tournament.fixtures.find((f) => f.round_label === 'Final');

    expect(sf1).toBeDefined();
    expect(sf1.team_a_name).toBe('Team A');
    expect(sf1.team_b_name).toBe('Team B');
    expect(sf1.next_fixture_id).toBe(final.id);
    expect(sf1.next_fixture_slot).toBe('team_a');
    expect(sf1.status).toBe('ready');

    expect(sf2).toBeDefined();
    expect(sf2.team_a_name).toBe('Team C');
    expect(sf2.team_b_name).toBe('Team D');
    expect(sf2.next_fixture_id).toBe(final.id);
    expect(sf2.next_fixture_slot).toBe('team_b');
    expect(sf2.status).toBe('ready');

    expect(final).toBeDefined();
    expect(final.team_a_name).toBeNull();
    expect(final.team_b_name).toBeNull();
    expect(final.status).toBe('waiting');
  });

  // ── 3. Round-Robin Schedule Generation ─────────────────────────

  it('generates a round-robin schedule ensuring all teams play each other', async () => {
    const { p1, p2, p3, p4 } = await createPlayerRoster();

    // 4 teams -> (4 * 3) / 2 = 6 matches
    const tournament = await tournamentEngine.createTournament({
      name: 'Colony League',
      sport: 'badminton',
      format: 'round_robin',
      teams: [
        { name: 'T1', player_ids: [p1.id] },
        { name: 'T2', player_ids: [p2.id] },
        { name: 'T3', player_ids: [p3.id] },
        { name: 'T4', player_ids: [p4.id] },
      ],
    });

    expect(tournament.fixtures.length).toBe(6);
    expect(tournament.standings.length).toBe(4);
    tournament.fixtures.forEach((f) => {
      expect(f.status).toBe('ready');
      expect(f.team_a_id).toBeDefined();
      expect(f.team_b_id).toBeDefined();
    });
  });

  // ── 4. Starting a Fixture Match ────────────────────────────────

  it('starts and initializes a live match linked to a fixture', async () => {
    const { p1, p2 } = await createPlayerRoster();

    const tournament = await tournamentEngine.createTournament({
      name: 'Finals Only',
      sport: 'volleyball',
      format: 'knockout',
      teams: [
        { name: 'Warriors', player_ids: [p1.id] },
        { name: 'Titans', player_ids: [p2.id] },
      ],
    });

    const finalFixture = tournament.fixtures[0];
    const { match, fixture } = await tournamentEngine.startFixtureMatch(finalFixture.id);

    expect(match).toBeDefined();
    expect(match.sport).toBe('volleyball');
    expect(match.tournament_id).toBe(tournament.id);
    expect(match.teams.length).toBe(2);
    expect(match.teams.find((t) => t.label === 'Team A')).toBeDefined();
    expect(match.teams.find((t) => t.label === 'Team B')).toBeDefined();

    expect(fixture.match_id).toBe(match.id);
    expect(fixture.status).toBe('in_progress');

    // Tournament becomes in_progress
    const tUpdated = await tournamentEngine.getTournamentDetails(tournament.id);
    expect(tUpdated.status).toBe('in_progress');
  });

  // ── 5. Auto-Progression in Knockout ─────────────────────────────

  it('automatically advances Semi-Final winners to the Final and crowns Champion', async () => {
    const { p1, p2, p3, p4 } = await createPlayerRoster();

    const tournament = await tournamentEngine.createTournament({
      name: 'Cup 2026',
      sport: 'volleyball',
      format: 'knockout',
      teams: [
        { name: 'Team A', player_ids: [p1.id] },
        { name: 'Team B', player_ids: [p2.id] },
        { name: 'Team C', player_ids: [p3.id] },
        { name: 'Team D', player_ids: [p4.id] },
      ],
    });

    const sf1 = tournament.fixtures.find((f) => f.round_label === 'Semi-Final 1');
    const sf2 = tournament.fixtures.find((f) => f.round_label === 'Semi-Final 2');
    const final = tournament.fixtures.find((f) => f.round_label === 'Final');

    // 1. Play SF 1: Team A beats Team B
    const { match: match1 } = await tournamentEngine.startFixtureMatch(sf1.id);
    const teamA1 = match1.teams.find((t) => t.label === 'Team A');
    await matchEngine.startMatch(match1.id);
    await matchEngine.enterResult(match1.id, {
      team_a_score: 25,
      team_b_score: 18,
      winning_team_id: teamA1.id,
    });
    await matchEngine.endMatch(match1.id, { reason: 'completed' });

    // Advance tournament
    let tProgress = await tournamentEngine.advanceTournament(tournament.id);
    let finalUpdated = tProgress.fixtures.find((f) => f.id === final.id);
    expect(finalUpdated.team_a_name).toBe('Team A');
    expect(finalUpdated.team_b_name).toBeNull();
    expect(finalUpdated.status).toBe('waiting');

    // 2. Play SF 2: Team C beats Team D (Team C is Team A in match2)
    const { match: match2 } = await tournamentEngine.startFixtureMatch(sf2.id);
    const teamC2 = match2.teams.find((t) => t.label === 'Team A');
    await matchEngine.startMatch(match2.id);
    await matchEngine.enterResult(match2.id, {
      team_a_score: 25,
      team_b_score: 20,
      winning_team_id: teamC2.id,
    });
    await matchEngine.endMatch(match2.id, { reason: 'completed' });

    // Advance tournament again -> Final is now ready!
    tProgress = await tournamentEngine.advanceTournament(tournament.id);
    finalUpdated = tProgress.fixtures.find((f) => f.id === final.id);
    expect(finalUpdated.team_a_name).toBe('Team A');
    expect(finalUpdated.team_b_name).toBe('Team C');
    expect(finalUpdated.status).toBe('ready');

    // 3. Play Final: Team A beats Team C
    const { match: matchFinal } = await tournamentEngine.startFixtureMatch(final.id);
    const teamAFinal = matchFinal.teams.find((t) => t.label === 'Team A');
    await matchEngine.startMatch(matchFinal.id);
    await matchEngine.enterResult(matchFinal.id, {
      team_a_score: 25,
      team_b_score: 22,
      winning_team_id: teamAFinal.id,
    });
    await matchEngine.endMatch(matchFinal.id, { reason: 'completed' });

    // Advance tournament -> Completed!
    tProgress = await tournamentEngine.advanceTournament(tournament.id);
    expect(tProgress.status).toBe('completed');
    expect(tProgress.winner_team_name).toBe('Team A');
    expect(tProgress.completedFixtures).toBe(3);
    expect(tProgress.progressPercent).toBe(100);
  });

  // ── 6. Standings & Points Table in Round-Robin ─────────────────

  it('updates points table and standings as matches finish in round robin', async () => {
    const { p1, p2, p3 } = await createPlayerRoster();

    // 3 teams: T1, T2, T3 (3 matches)
    const tournament = await tournamentEngine.createTournament({
      name: 'Tri-Series',
      sport: 'volleyball',
      format: 'round_robin',
      teams: [
        { name: 'Team 1', player_ids: [p1.id] },
        { name: 'Team 2', player_ids: [p2.id] },
        { name: 'Team 3', player_ids: [p3.id] },
      ],
    });

    const f1 = tournament.fixtures[0]; // T1 vs T2
    const { match: m1 } = await tournamentEngine.startFixtureMatch(f1.id);
    const winTeam1 = m1.teams.find((t) => t.label === 'Team A');
    await matchEngine.startMatch(m1.id);
    await matchEngine.enterResult(m1.id, {
      team_a_score: 25,
      team_b_score: 20,
      winning_team_id: winTeam1.id,
    });
    await matchEngine.endMatch(m1.id, { reason: 'completed' });

    await tournamentEngine.advanceTournament(tournament.id);
    const standings = await tournamentEngine.calculateStandings(tournament.id);

    expect(standings[0].team_name).toBe('Team 1');
    expect(standings[0].won).toBe(1);
    expect(standings[0].points).toBe(2);
    expect(standings[0].scoreDiff).toBe(5);

    expect(standings.find((s) => s.team_name === 'Team 2').lost).toBe(1);
    expect(standings.find((s) => s.team_name === 'Team 2').points).toBe(0);
  });

  // ── 7. Safe Match Deletion & Tournament Deletion ───────────────

  it('safely handles match deletion unlinking and cascade tournament deletion', async () => {
    const { p1, p2 } = await createPlayerRoster();

    const tournament = await tournamentEngine.createTournament({
      name: 'Single Match Cup',
      sport: 'volleyball',
      format: 'knockout',
      teams: [
        { name: 'Team A', player_ids: [p1.id] },
        { name: 'Team B', player_ids: [p2.id] },
      ],
    });

    const f = tournament.fixtures[0];
    const { match } = await tournamentEngine.startFixtureMatch(f.id);

    // Delete the match
    await matchEngine.deleteMatch(match.id);

    // Verify fixture match_id is unlinked
    const fAfter = await db.fixtures.get(f.id);
    expect(fAfter.match_id).toBeNull();

    // Delete the tournament
    await tournamentEngine.deleteTournament(tournament.id);

    expect(await db.tournaments.get(tournament.id)).toBeUndefined();
    expect(await db.fixtures.where('tournament_id').equals(tournament.id).toArray()).toEqual([]);
  });

  // ── 8. Error Handling ──────────────────────────────────────────

  it('throws TournamentNotFoundError on invalid tournament id', async () => {
    await expect(tournamentEngine.getTournamentDetails('invalid-id')).rejects.toThrow(
      TournamentNotFoundError
    );
  });

  it('throws FixtureNotFoundError on starting nonexistent fixture', async () => {
    await expect(tournamentEngine.startFixtureMatch('invalid-fixture-id')).rejects.toThrow(
      FixtureNotFoundError
    );
  });
});
