import Dexie from 'dexie';
import { APP_CONFIG } from '../config/appConfig';

export class Mandir11Database extends Dexie {
  constructor(dbName = APP_CONFIG.dbName) {
    super(dbName);
    this.version(1).stores({
      players: 'id, name, is_active, created_at',
      matches: 'id, sport, status, date, tournament_id, fixture_id, created_at',
      teams: 'id, match_id, label',
      team_players: 'id, team_id, player_id',
      match_results: 'id, match_id, winning_team_id',
      innings: 'id, match_id, batting_team_id, innings_number',
      overs: 'id, innings_id, over_number, bowler_id',
      balls: 'id, over_id, ball_number, batter_id',
      ledger_entries: 'id, match_id, player_a_id, player_b_id',
      tournaments: 'id, name, sport, format, status',
      fixtures: 'id, tournament_id, match_id',
    });
  }
}

export const db = new Mandir11Database();
