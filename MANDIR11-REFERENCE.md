# 🏆 Mandir 11 — Project Reference

**Read this entire file before writing or modifying any code.** This is the single
source of truth for architecture, data model, and contracts. If a design decision
changes mid-build, this file gets edited FIRST, then the code is updated to match —
never the other way around.

---

## 1. Project Overview

**Mandir 11** is a private, mobile-first, **local-first** sports platform for a single
colony/community. It replaces mental bookkeeping ("who played, who won, who owes whom money")
with a permanent, automatic, on-device record.

**Core Architecture Philosophy:**
- **Local-First & Offline-First:** All data lives on the user's device. The application works 100% offline with zero network or cloud service dependency.
- **No Authentication / No Accounts:** No user login, no signup, no passwords, no JWTs, and no admin accounts. Anyone opening the app has immediate, open access to record matches, view statistics, and manage local data.
- **Independent Device Data:** Each user's device maintains its own independent database. Cross-device syncing and cloud database replication are explicitly out of scope.
- **No Cloud Database:** No remote PostgreSQL or cloud server stores user data.

**Sports supported:** Cricket (with full ball-by-ball scoring), Volleyball (result-only),
Badminton (result-only, singles + doubles).

**The one thing everything revolves around:** a **Match**. Every player stat, ledger
entry, ranking, and streak is derived from completed matches — nothing is entered
twice, nothing is manually recalculated.

**What makes this a strong build (not just CRUD):** instant on-device ball-by-ball cricket
scoring state machine, a genuine tournament engine (knockout/round-robin/league),
a match-specific peer-to-peer ledger with automatic settlement, and a statistics
engine that derives rankings/streaks/records purely from local match history.

**Explicitly out of scope for v1** (do not build these even if asked casually —
confirm with the user first):
- Automatic/random/AI-balanced team generation — teams are always chosen manually
- Push notifications
- Match photos/memories
- In-app money transfer — the ledger only *records* who owes whom, it never moves money
- Cloud database syncing, user accounts, and multi-device replication

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Web Frontend | React + Tailwind / CSS (Vite) | Fast iteration, modern reactive UI, full offline PWA support |
| Mobile Frontend | React Native (Expo) | Share logic/types with web; installable app for one-hand scoring on the ground |
| Web Persistent Storage | **IndexedDB** (via Dexie.js / native IDB) | Fast, structured, asynchronous client-side storage with indexes for offline web |
| Mobile Persistent Storage | **Local SQLite** (via `expo-sqlite`) | Robust, relational embedded SQL database for native iOS/Android devices |
| Backend / API | *None required for app runtime* (Local-only engines) | All business logic runs directly in the client. (FastAPI backend preserved as legacy/dev reference, not required for production app) |
| State & Scoring Engine | In-App Reactive State Machine | Instant local state updates during ball-by-ball cricket scoring with zero network lag |
| Auth & Security | **None (No-Auth, Open Local Access)** | Local device tool — no JWT, no login screens, no credentials, no authorization gates |
| Charts/Stats | Recharts (web), Victory Native (mobile) | Rankings, streak graphs, player stat pages computed on device |
| Backup / Portability | JSON Export / Import | Simple file-based backup and transfer between devices without cloud accounts |

---

## 3. Architecture

```text
                                MANDIR 11
                           (Local-First System)
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
             React Web App                  React Native App
             (Desktop / PWA)                 (iOS / Android)
                    │                               │
         ┌──────────┴──────────┐         ┌──────────┴──────────┐
         │ Client-Side Engines │         │ Client-Side Engines │
         │  • Match Engine     │         │  • Match Engine     │
         │  • Cricket Scorer   │         │  • Cricket Scorer   │
         │  • Ledger Engine    │         │  • Ledger Engine    │
         │  • Stats Engine     │         │  • Stats Engine     │
         │  • Tournament Engine│         │  • Tournament Engine│
         └──────────┬──────────┘         └──────────┬──────────┘
                    │                               │
               Local Driver                    Local Driver
                    │                               │
                    ▼                               ▼
             IndexedDB Storage                SQLite Storage
             (Browser Sandbox)               (Device Storage)
```

- **Local Execution:** All engines (Match Engine, Cricket Scorer, Ledger Engine, Fixture Generator, Stats Engine) run entirely inside the client process in JavaScript / TypeScript.
- **Direct Storage Access:** Web reads/writes directly to IndexedDB; Mobile reads/writes directly to local SQLite.
- **Pure Derived Data:** The **Match Engine** is the only component allowed to write match state. The **Ledger Engine** and **Stats Engine** only ever *read* completed matches from local storage and derive output — they never hold their own mutable state that could drift from match history.
- **Zero Server Dependency:** The application can run entirely in airplane mode without internet connectivity.

---

## 4. Folder Structure

```text
mandir11/
├── MANDIR11-REFERENCE.md        ← this file (single source of truth)
├── web/                          ← React Web Application (IndexedDB-backed)
│   ├── src/
│   │   ├── db/                  ← IndexedDB schema, stores, and access layer (Dexie / IDB)
│   │   ├── engines/             ← Client-side business logic
│   │   │   ├── matchEngine.js   ← quick match + tournament match lifecycle
│   │   │   ├── cricketScorer.js ← ball-by-ball state machine, over/innings rollover
│   │   │   ├── ledgerEngine.js  ← stake validation + settlement calculation
│   │   │   ├── fixtureGen.js    ← knockout / round robin / league scheduling
│   │   │   └── statsEngine.js   ← batting/bowling averages, streaks, rankings
│   │   ├── config/
│   │   │   └── rankingRules.json← config-driven ranking weights
│   │   ├── pages/               ← Dashboard, QuickMatch, CricketScorer, Tournaments,
│   │   │                           Fixtures, Players, PlayerProfile, Stats, Rankings,
│   │   │                           Ledger, Settings / DataManagement
│   │   └── components/          ← UI components, scoreboards, cards
│   └── package.json
├── mobile/                       ← React Native (Expo) App (SQLite-backed)
│   ├── src/
│   │   ├── db/                  ← expo-sqlite schema, migrations, and repository layer
│   │   ├── engines/             ← Shared client-side business logic (mirrors web engines)
│   │   ├── config/              ← rankingRules.json
│   │   └── screens/             ← mirrors web/src/pages
│   └── package.json
└── backend/                      ← Legacy / Developer Reference Service (not required for runtime)
    ├── main.py
    ├── models/
    ├── engines/
    ├── routers/
    └── db/
```

---

## 5. Configuration & Storage Settings

Since there is no remote database or auth server, all configuration is static and client-side:

```javascript
// Web / Mobile Client Config (e.g., src/config/appConfig.js)
export const APP_CONFIG = {
  appName: "Mandir 11",
  storageKeyPrefix: "mandir11_",
  dbName: "mandir11_local_db",
  dbVersion: 1,
  offlineOnly: true,
};
```

*Note:* Server-side environment variables (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRY_HOURS`, `ADMIN_INVITE_CODE`) are removed from the runtime requirements.

---

## 6. Core Data Model & Storage Schema

The relational schema is preserved exactly, mapped to **IndexedDB Object Stores** (Web) and **SQLite Tables** (Mobile):

```text
Player
  id (string/UUID), name (string), is_active (boolean), created_at (timestamp)

Match
  id (string/UUID), sport ("cricket"|"volleyball"|"badminton"), status ("upcoming"|"live"|"completed"|"abandoned")
  date (string/ISO), tournament_id (string/UUID, nullable), fixture_id (string/UUID, nullable)
  end_reason ("completed"|"time"|"players_unavailable"|"rain"|"other", nullable)
  player_of_match_id (string/UUID, nullable)

Team  -- always scoped to one match, never a standalone reusable entity
  id (string/UUID), match_id (string/UUID), label ("Team A" | "Team B")

TeamPlayer
  id (string/UUID), team_id (string/UUID), player_id (string/UUID)

-- Cricket-specific
Innings
  id (string/UUID), match_id (string/UUID), batting_team_id (string/UUID), innings_number (1|2), overs_limit (int)
  total_runs (int), total_wickets (int), is_closed (boolean)

Over
  id (string/UUID), innings_id (string/UUID), over_number (int), bowler_id (string/UUID)

Ball
  id (string/UUID), over_id (string/UUID), ball_number (int), runs (int), extra_type ("none"|"wide"|"no_ball")
  is_wicket (boolean), dismissal_type ("bowled"|"caught"|"run_out"|"lbw"|"stumped"|"other", nullable)
  batter_id (string/UUID), dismissed_player_id (string/UUID, nullable), next_batter_id (string/UUID, nullable)

-- Volleyball / Badminton results (no ball-by-ball detail)
MatchResult
  id (string/UUID), match_id (string/UUID), team_a_score (int, nullable), team_b_score (int, nullable)
  winning_team_id (string/UUID)

-- Ledger
LedgerEntry
  id (string/UUID), match_id (string/UUID), player_a_id (string/UUID), player_b_id (string/UUID), amount (number)
  -- validated: both sides of one entry must carry equal amount

Tournament
  id (string/UUID), name (string), sport ("cricket"|"volleyball"|"badminton"), format ("knockout"|"round_robin"|"league"), status

Fixture
  id (string/UUID), tournament_id (string/UUID), round_label (string), match_id (string/UUID, nullable)
  team_a_source (string), team_b_source (string)  -- e.g. "winner of fixture #3" for bracket progression
```

Nothing about "who owes whom" is stored beyond `LedgerEntry` + the match's winning
team — settlement direction is *computed dynamically*, never stored redundantly.

---

## 7. Config-Driven Rules (not hardcoded)

Stored in `src/config/rankingRules.json` (bundled in both web and mobile apps) so ranking weights can be tuned without changing engine logic:

```json
{
  "overall_ranking": {
    "win_weight": 3,
    "loss_weight": 0,
    "participation_weight": 0.1
  },
  "streak_reset_on": "loss",
  "cricket_stats": {
    "qualifying_innings_for_average": 1,
    "qualifying_overs_for_economy": 2
  }
}
```

Any "who's #1 this month" logic reads this configuration — never edit `statsEngine.js` directly to tune weights.

---

## 8. Quick Match — Step-by-Step Flow

```text
Select Sport
   ↓
Select Available Players (from local player pool, minus inactive/unavailable)
   ↓
Manually Create Teams (any size, no auto-balancing — reject requests to add this)
   ↓
[Optional] Add Match Ledger stakes (must validate equal amounts per matchup)
   ↓
Start Match (saved to local IndexedDB / SQLite as "live")
   ↓
Score (cricket: local ball-by-ball state updates | volleyball/badminton: enter final result)
   ↓
End Match (explicit reason required)
   ↓
Select Player of the Match (manual, optional stat-based suggestion)
   ↓
Ledger Engine computes settlement automatically from winning team + stakes
   ↓
Stats Engine recalculates affected player/team/sport stats, streaks, rankings on demand
```

The user never manually edits a statistic — every number is derived directly from completed match records.

---

## 9. Client Engine & Local Storage Interface

In the local-first architecture, UI components interact directly with local services and pure functional engines rather than remote REST/WebSocket endpoints:

### Local Services & Operations
- **`PlayerService`**:
  - `createPlayer(name)`
  - `togglePlayerActive(id, isActive)`
  - `getPlayers()`
- **`MatchService`**:
  - `createMatch({ sport, tournamentId? })`
  - `setMatchTeams(matchId, teams)`
  - `setMatchLedger(matchId, entries)`
  - `endMatch(matchId, reason, playerOfMatchId?)`
  - `getMatchById(matchId)`
  - `listMatches({ sport?, status? })`
- **`CricketScorer` (Local State Machine)**:
  - `recordBall({ matchId, inningsId, runs, extraType, isWicket, dismissalType, nextBatterId })`
  - `endOver({ matchId, inningsId, nextBowlerId })`
  - `switchInnings({ matchId, nextBattingTeamId })`
  - `getInningsState(inningsId)` (returns runs, wickets, overs, current batter, current bowler, run rate)
- **`LedgerEngine`**:
  - `calculateSettlement(matchId)` → derived list of payments (`{ fromPlayerId, toPlayerId, amount }`)
  - `getPlayerLedgerHistory(playerId)` → aggregate balance and match-by-match ledger records
- **`StatsEngine`**:
  - `getPlayerStats(playerId, sport?)` → matches, win rate, batting/bowling averages, highest scores
  - `getRankings(sport)` → dynamic leaderboard computed using `rankingRules.json`
  - `getStreaks(sport)` → active win/loss streaks derived from chronological match history
- **`TournamentEngine`**:
  - `createTournament({ name, sport, format, playerIds })`
  - `generateFixtures(tournamentId)` → creates knockout bracket or round-robin schedule
  - `advanceTournament(tournamentId)` → updates downstream fixtures when matches complete

---

## 10. UI Screens

- **Dashboard:** Recent matches, active tournaments, quick links to start match or score.
- **Quick Match Wizard:** Sport selection, player availability checkboxes, manual team drag-and-drop / assignment, optional ledger stakes.
- **Cricket Scorer:** One-hand ground scoring interface with large tactile buttons (0, 1, 2, 3, 4, 6, Wide, No Ball, Wicket, End Over), instant scorecard preview, bowler/batter switcher modals.
- **Volleyball / Badminton Result Entry:** Simple score and winner recording.
- **Tournaments:** Tournament creation, interactive knockout bracket visualization, round-robin/league points table.
- **Fixtures:** Upcoming and scheduled tournament matches with direct "Score Match" buttons.
- **Players:** Player list with instant availability toggle and quick add form.
- **Player Profile:** Overall records, sport-specific breakdown (batting, bowling, win-rate), personal streak history, and individual ledger balance.
- **Match History / Scorecard Detail:** Full ball-by-ball over timeline, scorecard breakdown, match ledger settlement.
- **Statistics & Rankings:** Filterable leaderboards (overall, cricket, volleyball, badminton) and records.
- **Ledger:** Comprehensive colony settlement summary (who owes whom across all recorded matches) and individual statement views.
- **Data Management / Settings:** Local database export (download JSON backup), import backup, and database reset options. *(Replaces legacy admin panel).*

---

## 11. End-to-End User Flows

- **Same-Day Casual Match:** Open app → Dashboard → Quick Match → pick sport → select available players → create two teams → (optional) set stakes → Start → score live on device → End Match → pick Player of Match → done, stats and ledger update automatically.
- **Ground Scorer (Cricket):** Open live match from Dashboard → tap runs/wide/wicket per ball → on wicket, pick dismissal type + next batter from remaining players → at over end, pick next bowler → repeat until match concludes. Works 100% offline in poor connectivity.
- **Checking Money Owed:** Open app → Ledger tab (or Player Profile → Ledger) → see exact net balances and match-by-match breakdown.
- **Organizing a Tournament:** Tournaments → Create → pick sport + format (knockout/round robin/league) → select players → app generates bracket/fixtures → tap any fixture to score → standings and progression update automatically.

---

## 12. Known Gotchas & Local-First Principles

- **Storage Persistence & Quotas (Web):** Modern browsers may evict IndexedDB under extreme storage pressure. The web app should request persistent storage permissions (`navigator.storage.persist()`) and offer easy JSON export.
- **Crash / Battery Resilience:** On-device cricket scoring must write each ball immediately to IndexedDB/SQLite so that a phone running out of battery or reloading the browser loses zero balls.
- **Flexible Team Sizes** (5 vs 6, 7 vs 9, etc.) — never assume equal-length team arrays in scoring or stats code.
- **One Batter at a Time, No Non-Striker:** Do not build traditional striker/non-striker rotation logic; colony cricket rules in Mandir 11 use single-batter strike.
- **Wide Balls Don't Count as Legal Deliveries:** Over completion logic must count legal balls only (`extra_type !== 'wide'`), separate from total balls bowled.
- **Ledger Settlement Matches Winner:** Validate stake pairs sum to equal amounts on both sides before allowing match start.
- **Teams are Never Permanent Entities:** Lineup history is derived by matching player-ID sets across matches, not by saving reusable team entities.
- **Multi-Innings Support (Test Matches):** The `Innings` store's `innings_number` field supports multiple innings per team per match.
- **Independent Device Datasets:** Because there is no central server or syncing, each device acts as its own source of truth. Users can backup or share state via JSON export/import if desired.

---

## 13. Build Phases

1. **Phase 1: Player + Match Core (Local-First)** — local storage setup (IndexedDB / SQLite), player CRUD, availability toggle, manual team creation, Quick Match flow with volleyball/badminton result entry.
2. **Phase 2: Cricket Scoring Engine** — client-side ball-by-ball state machine, instant local persistence per ball, wicket/bowler management, over/innings rollover, multi-innings support.
3. **Phase 3: Ledger Engine** — stake entry + validation, automated settlement calculation on match completion, player ledger breakdown.
4. **Phase 4: Stats & Rankings Engine** — batting/bowling averages, sport-specific analytics, config-driven rankings, streak tracking — all derived on the fly from local match data.
5. **Phase 5: Tournament Engine** — knockout bracket generation, round-robin points table, league scheduling, and auto-progression.
6. **Phase 6: Polish & Data Portability** — JSON backup export/import, Player of the Match suggestions, Fun Records, responsive mobile/web layout optimizations.

**MVP Checkpoint:** End of Phase 2 — complete, offline, on-device cricket scoring and match lifecycle fully operational.

---

## 14. Quick Start (Development)

```bash
# Web Application (React + Vite + IndexedDB)
cd web
npm install
npm run dev

# Mobile Application (React Native + Expo + SQLite)
cd mobile
npm install
npx expo start
```

*(Note: No database server, Docker container, or backend service needs to be launched for Mandir 11 to run).*

---

## 15. Security, Privacy & Data Isolation

- **Zero Remote Tracking:** No analytics, user accounts, or telemetry are transmitted to any server.
- **Complete Privacy:** Colony match records and ledger amounts stay strictly on the user's physical device.
- **No Credentials:** No passwords or auth tokens are stored or managed.
