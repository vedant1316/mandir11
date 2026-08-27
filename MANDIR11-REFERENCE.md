# 🏆 Mandir 11 — Project Reference

**Read this entire file before writing or modifying any code.** This is the single
source of truth for architecture, data model, and contracts. If a design decision
changes mid-build, this file gets edited FIRST, then the code is updated to match —
never the other way around.

---

## 1. Project Overview

**Mandir 11** is a private, mobile-first sports platform for a single colony/community.
It replaces mental bookkeeping ("who played, who won, who owes whom money") with a
permanent, automatic record.

**Sports supported:** Cricket (with full ball-by-ball scoring), Volleyball (result-only),
Badminton (result-only, singles + doubles).

**The one thing everything revolves around:** a **Match**. Every player stat, ledger
entry, ranking, and streak is derived from completed matches — nothing is entered
twice, nothing is manually recalculated.

**What makes this a strong build (not just CRUD):** real-time ball-by-ball cricket
scoring over WebSocket, a genuine tournament engine (knockout/round-robin/league),
a match-specific peer-to-peer ledger with automatic settlement, and a statistics
engine that derives rankings/streaks/records purely from match history.

**Explicitly out of scope for v1** (do not build these even if asked casually —
confirm with the user first):
- Automatic/random/AI-balanced team generation — teams are always chosen manually
- Push notifications
- Match photos/memories
- In-app money transfer — the ledger only *records* who owes whom, it never moves money

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | FastAPI (Python) | async support needed for WebSocket scoring, fast to scaffold |
| Database | PostgreSQL | relational integrity matters (players↔teams↔matches↔ledger), needs real transactions for settlement math |
| Realtime | WebSockets (FastAPI native) | live cricket score must push to all viewers instantly |
| Web frontend | React + Tailwind | fastest iteration, matches existing skill |
| Mobile | React Native (Expo) | share logic/types with the web app; **not a website wrapper** — needs to work as an installable app for one-hand scoring on the ground |
| Auth | JWT, single "admin" role + anonymous read-only viewers | private colony app — one gate, not a full user system |
| Charts/Stats | Recharts (web), Victory Native (mobile) | rankings, streak graphs, player stat pages |

Do not introduce a second database, a message queue, or microservices — this is a
single-community app; a monolith FastAPI service is intentionally sufficient.

---

## 3. Architecture

```text
                    MANDIR 11
                        │
            ┌───────────┴───────────┐
            │                       │
      React Web App          React Native App
            │                       │
            └───────────┬───────────┘
                         │
                REST API + WebSocket
                         │
                     FastAPI
                         │
              ┌──────────┼──────────┐
              │          │          │
        Match Engine  Ledger    Stats Engine
              │        Engine       │
              └──────────┼──────────┘
                         │
                    PostgreSQL
```

The **Match Engine** is the only thing allowed to write match state. The **Ledger
Engine** and **Stats Engine** only ever *read* completed matches and derive output —
they never hold their own mutable state that could drift from match history.

---

## 4. Folder Structure

```text
mandir11/
├── README-REFERENCE.md          ← this file
├── backend/
│   ├── main.py                  ← FastAPI app entrypoint, WebSocket routes
│   ├── models/
│   │   ├── player.py
│   │   ├── match.py
│   │   ├── cricket.py           ← Innings, Over, Ball
│   │   ├── tournament.py
│   │   └── ledger.py
│   ├── engines/
│   │   ├── match_engine.py      ← quick match + tournament match lifecycle
│   │   ├── cricket_scorer.py    ← ball-by-ball logic, over/innings rollover
│   │   ├── ledger_engine.py     ← stake validation + settlement calculation
│   │   ├── fixture_generator.py ← knockout / round robin / league scheduling
│   │   └── stats_engine.py      ← batting/bowling averages, streaks, rankings
│   ├── routers/
│   │   ├── players.py
│   │   ├── matches.py
│   │   ├── cricket.py           ← REST + WebSocket endpoints for live scoring
│   │   ├── tournaments.py
│   │   ├── ledger.py
│   │   └── stats.py
│   ├── config/
│   │   └── ranking_rules.yaml   ← see section 7
│   └── db/
│       ├── schema.sql
│       └── session.py
├── web/                          ← React app
│   └── src/pages/ (Dashboard, QuickMatch, CricketScorer, Tournaments,
│                    Fixtures, Players, PlayerProfile, Stats, Rankings, Ledger)
└── mobile/                       ← React Native (Expo) app, mirrors web/src/pages
    └── src/screens/
```

---

## 5. Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/mandir11
JWT_SECRET=change-me
JWT_EXPIRY_HOURS=168
WEBSOCKET_PATH=/ws/match
ADMIN_INVITE_CODE=set-a-code-for-first-admin-signup
```

---

## 6. Core Data Model

```text
Player
  id, name, is_active (bool)

Match
  id, sport (cricket|volleyball|badminton), status (upcoming|live|completed|abandoned)
  date, tournament_id (nullable, null = Quick Match), fixture_id (nullable)
  end_reason (completed|time|players_unavailable|rain|other, nullable)
  player_of_match_id (nullable)

Team  -- always scoped to one match, never a standalone reusable entity
  id, match_id, label ("Team A" / "Team B")

TeamPlayer
  team_id, player_id

-- Cricket-specific
Innings
  id, match_id, batting_team_id, innings_number (1 or 2), overs_limit
  total_runs, total_wickets, is_closed

Over
  id, innings_id, over_number, bowler_id

Ball
  id, over_id, ball_number, runs, extra_type (none|wide|no_ball), is_wicket
  dismissal_type (bowled|caught|run_out|lbw|stumped|other, nullable)
  batter_id, dismissed_player_id (nullable), next_batter_id (nullable)

-- Volleyball / Badminton results (no ball-by-ball detail)
MatchResult
  match_id, team_a_score (nullable, badminton has none), team_b_score (nullable)
  winning_team_id

-- Ledger
LedgerEntry
  id, match_id, player_a_id, player_b_id, amount
  -- validated: both sides of one entry must carry equal amount

Tournament
  id, name, sport, format (knockout|round_robin|league), status

Fixture
  id, tournament_id, round_label, match_id (nullable until played)
  team_a_source, team_b_source  -- e.g. "winner of fixture #3" for bracket progression
```

Nothing about "who owes whom" is stored beyond `LedgerEntry` + the match's winning
team — settlement direction is *computed*, never stored redundantly.

---

## 7. Config-Driven Rules (not hardcoded)

`backend/config/ranking_rules.yaml` — so ranking weights can change without touching
engine code:

```yaml
overall_ranking:
  win_weight: 3
  loss_weight: 0
  participation_weight: 0.1

streak_reset_on: loss   # or "loss_or_no_result"

cricket_stats:
  qualifying_innings_for_average: 1
  qualifying_overs_for_economy: 2
```

Any "who's #1 this month" logic reads this file — never edit `stats_engine.py`
directly to tune weights.

---

## 8. Quick Match — Step-by-Step Flow

```text
Select Sport
   ↓
Select Available Players (from permanent pool, minus inactive/unavailable)
   ↓
Manually Create Teams (any size, no auto-balancing — reject requests to add this)
   ↓
[Optional] Add Match Ledger stakes (must validate equal amounts per matchup)
   ↓
Start Match
   ↓
Score (cricket: ball-by-ball over WebSocket | volleyball/badminton: enter final result)
   ↓
End Match (explicit reason required)
   ↓
Select Player of the Match (manual, optional AI/stat-based suggestion later)
   ↓
Ledger Engine computes settlement automatically from winning team + stakes
   ↓
Stats Engine recalculates affected player/team/sport stats, streaks, rankings
```

The organizer never manually edits a statistic — every number is derived from
step 6 (scoring) onward.

---

## 9. API / WebSocket Contract

**REST (representative, not exhaustive):**
- `POST /players` `{name}` → create player
- `PATCH /players/{id}` `{is_active}` → toggle availability
- `POST /matches` `{sport, tournament_id?}` → create match, returns `match_id`
- `POST /matches/{id}/teams` `{teams: [{label, player_ids}]}`
- `POST /matches/{id}/ledger` `{entries: [{player_a_id, player_b_id, amount}]}`
- `POST /matches/{id}/end` `{reason}`
- `POST /matches/{id}/player_of_match` `{player_id}`
- `GET /players/{id}/stats` → full profile per section 20 of the original spec
- `GET /rankings?sport=cricket` → derived, not stored

**WebSocket** `ws/match/{match_id}` (cricket only):
- Client → server events: `{"action": "ball", "runs": 4, "extra": null, "wicket": false}`,
  `{"action": "wicket", "dismissal": "bowled", "next_batter_id": "..."}`,
  `{"action": "end_over", "next_bowler_id": "..."}`
- Server → all connected clients: full current innings state after every event
  (`over`, `ball`, `score`, `wickets`, `current_batter`, `current_bowler`)
- On reconnect, client sends `{"action": "sync"}` and receives full current state —
  the scorer's phone dying mid-over must not lose data (server is source of truth,
  never the client).

---

## 10. UI Screens

Dashboard · Quick Match wizard · Cricket Scorer (one-hand, big buttons: 0/1/2/3/4/6/
Wide/Wicket/End Over) · Volleyball/Badminton result entry · Tournaments (create +
bracket/table view) · Fixtures · Players (list + availability toggle) · Player Profile ·
Match History / Scorecard detail · Statistics (per sport) · Rankings · Ledger
(match-level + per-player history) · Fun Records · Admin panel

---

## 11. End-to-End User Flows

**Organizer, same-day casual match:** Dashboard → Quick Match → pick sport → tick
available players → build two teams by tapping names → (optional) set stakes →
Start → score live → End Match → pick Player of Match → done, everything else updates
itself.

**Scorer, mid-cricket-match:** open live match from Dashboard → tap runs/wide/wicket
per ball → on wicket, pick dismissal type + next batter from a filtered list of
players not yet out → at over end, pick next bowler → repeat until innings/match ends.

**Any colony member, checking money owed:** Players → their profile → Ledger tab →
see match-by-match win/loss + amount owed or receivable.

**Admin, running a tournament:** Tournaments → Create → pick sport + format
(knockout/round robin/league) → select participating players → app generates
fixtures → each fixture opens into a normal match flow → bracket/points table
updates automatically as fixtures complete.

---

## 12. Known Gotchas

- **Flexible team sizes** (5 vs 6, 7 vs 9, etc.) — never assume equal-length team
  arrays in scoring or stats code.
- **One batter at a time, no non-striker** — do not build traditional
  striker/non-striker rotation logic; it doesn't apply here.
- **Wide balls don't count as legal deliveries** — over completion logic must count
  legal balls only, separate from the ball log.
- **WebSocket disconnects during live scoring** — the phone on the ground *will*
  lose signal or battery. Server holds authoritative state; always support a "sync"
  request that returns full current innings state.
- **Ledger settlement must always match the winning side** — validate stake pairs
  sum to equal amounts on both sides before allowing match start, not after.
- **Teams are never permanent entities** — don't be tempted to add a "save this team
  for later" feature; lineup history is derived by matching player-ID sets across
  matches, not by naming a team.
- **Test match = 2 innings per team** — the `Innings` table's `innings_number` field
  must support multiple innings per team per match; don't hardcode "1 innings = 1 team".

---

## 13. Build Phases

1. **Player + Match core** — player CRUD, availability, manual team creation, Quick
   Match flow with volleyball/badminton result entry (no cricket yet)
2. **Cricket scoring** — ball-by-ball engine, WebSocket live updates, wicket/bowler
   management, over/innings rollover, Test match multi-innings support
3. **Ledger** — stake entry + validation, automatic settlement on match end,
   per-player ledger history view
4. **Stats + Rankings** — batting/bowling averages, sport-specific stats, overall/
   sport rankings, streaks — all derived, none stored redundantly
5. **Tournaments** — knockout bracket, round robin, league points table, fixture
   generation and auto-progression
6. **Polish** — Player of the Match suggestions, Fun Records, admin panel, mobile
   app parity with web

**MVP checkpoint:** end of Phase 2 — you can already run and fully score a real
cricket match end-to-end, which is the hardest part of the whole app.

---

## 14. Quick Start

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload

# Web
cd web
npm install
npm run dev

# Mobile
cd mobile
npm install
npx expo start
```
