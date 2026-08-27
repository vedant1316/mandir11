# 🏆 Mandir 11

A private, mobile-first sports platform for a single colony/community. Replaces
mental bookkeeping ("who played, who won, who owes whom money") with permanent,
automatic records.

## Current Status — Phase 1 Complete

Phase 1 implements the **Player + Match Core**:

- ✅ Player CRUD and availability toggling
- ✅ Manual team creation (any size, no auto-balancing)
- ✅ Quick Match wizard (5-step flow)
- ✅ Volleyball final-result entry
- ✅ Badminton final-result entry
- ✅ Match state machine (upcoming → live → completed/abandoned)
- ✅ Player of the Match (manual selection, validated against participants)
- ✅ Match history with filters
- ✅ Match detail view
- ✅ JWT admin authentication
- ✅ Anonymous read-only access
- ✅ React + Tailwind web frontend
- ✅ Backend test suite (17+ tests)

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI |
| Database | PostgreSQL (application) / SQLite in-memory (isolated tests) |
| ORM | SQLAlchemy 2.0 (async) |
| Auth | JWT via python-jose, bcrypt passwords |
| Frontend | React + Vite + Tailwind CSS |
| HTTP client | Axios |
| Router | React Router v6 |
| Tests | pytest + pytest-asyncio + httpx |

## Architecture

```
React Web App
     │
     │  REST API
     ▼
  FastAPI
     │
     ├── Match Engine  (match state writes — only component that writes match state)
     ├── Routers       (HTTP layer only — delegates to engines)
     ├── Models        (SQLAlchemy ORM)
     └── Schemas       (Pydantic request/response)
     │
  PostgreSQL (app) / In-memory SQLite (tests)
```

The **Match Engine** (`backend/engines/match_engine.py`) is the only component
allowed to write match state. Route handlers delegate all business logic to it.

## Project Structure

```
mandir11/
├── MANDIR11-REFERENCE.md   ← single source of truth
├── .env.example
├── .gitignore
├── README.md
│
├── backend/
│   ├── main.py             ← FastAPI entrypoint
│   ├── auth.py             ← JWT auth + dependencies
│   ├── requirements.txt
│   ├── pyproject.toml      ← pytest config
│   │
│   ├── models/             ← SQLAlchemy ORM models
│   │   ├── player.py
│   │   ├── match.py        ← Match, Team, TeamPlayer, MatchResult
│   │   ├── cricket.py      ← Phase 2 placeholder
│   │   ├── tournament.py   ← Phase 5 placeholder
│   │   └── ledger.py       ← Phase 3 placeholder
│   │
│   ├── engines/
│   │   ├── match_engine.py ← Full Phase 1 match lifecycle
│   │   ├── cricket_scorer.py   ← Phase 2 placeholder
│   │   ├── ledger_engine.py    ← Phase 3 placeholder
│   │   ├── fixture_generator.py← Phase 5 placeholder
│   │   └── stats_engine.py     ← Phase 4 placeholder
│   │
│   ├── routers/
│   │   ├── auth.py         ← POST /auth/login, /auth/register
│   │   ├── players.py      ← GET/POST /players, PATCH /players/{id}
│   │   ├── matches.py      ← Full match lifecycle endpoints
│   │   ├── cricket.py      ← Phase 2 placeholder (returns 501)
│   │   ├── tournaments.py  ← Phase 5 placeholder
│   │   ├── ledger.py       ← Phase 3 placeholder
│   │   └── stats.py        ← Phase 4 placeholder
│   │
│   ├── schemas/            ← Pydantic request/response models
│   │   ├── player.py
│   │   ├── match.py
│   │   └── auth.py
│   │
│   ├── db/
│   │   ├── session.py      ← Async SQLAlchemy engine + get_db
│   │   ├── base.py         ← Declarative Base
│   │   └── schema.sql      ← PostgreSQL production DDL
│   │
│   ├── config/
│   │   └── ranking_rules.yaml  ← Phase 4 config-driven weights
│   │
│   └── tests/
│       ├── conftest.py     ← In-memory SQLite test DB
│       ├── test_players.py
│       └── test_matches.py
│
└── web/                    ← React + Tailwind frontend
    ├── index.html
    ├── tailwind.config.js
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── index.css
        ├── services/api.js
        ├── hooks/useAuth.js
        ├── components/
        │   ├── Navbar.jsx
        │   ├── MatchCard.jsx
        │   ├── PlayerBadge.jsx
        │   └── ui.jsx
        └── pages/
            ├── Dashboard.jsx
            ├── Players.jsx
            ├── QuickMatch.jsx
            ├── ResultEntry.jsx
            ├── MatchHistory.jsx
            ├── MatchDetail.jsx
            └── Login.jsx
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Database connection string | `postgresql+asyncpg://user:password@localhost:5432/mandir11` |
| `JWT_SECRET` | JWT signing secret | ⚠️ Change in production |
| `JWT_EXPIRY_HOURS` | Token lifetime in hours | `168` (1 week) |
| `WEBSOCKET_PATH` | WebSocket path (Phase 2) | `/ws/match` |
| `ADMIN_INVITE_CODE` | Code required for admin registration | Set a secure value |

## Local Setup

### Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate
# Activate (Mac/Linux)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy and edit environment file
cp .env.example .env
# Edit .env — set DATABASE_URL (pointing to your PostgreSQL instance), ADMIN_INVITE_CODE and JWT_SECRET

# Start the backend
uvicorn main:app --reload
```

Backend runs at: http://localhost:8000  
Swagger docs at: http://localhost:8000/docs

### Web Frontend

```bash
cd web

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend runs at: http://localhost:5173

### First Admin Account

With both servers running, register the first admin via Swagger (`/docs`) or curl:

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword","invite_code":"your-invite-code"}'
```

## API Endpoints (Phase 1)

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | None (invite code) | Create admin account |
| POST | `/auth/login` | None | Login, get JWT |

### Players
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/players` | Public | List all players |
| GET | `/players/{id}` | Public | Get single player |
| POST | `/players` | Admin | Create player |
| PATCH | `/players/{id}` | Admin | Toggle is_active |

### Matches
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/matches` | Public | List matches (filterable) |
| GET | `/matches/{id}` | Public | Match detail |
| POST | `/matches` | Admin | Create match |
| POST | `/matches/{id}/teams` | Admin | Create Team A + Team B |
| POST | `/matches/{id}/start` | Admin | Start match (→ live) |
| POST | `/matches/{id}/result` | Admin | Enter volleyball/badminton result |
| POST | `/matches/{id}/end` | Admin | End match (→ completed/abandoned) |
| POST | `/matches/{id}/player_of_match` | Admin | Set Player of Match |

## Running Tests

```bash
cd backend
.venv\Scripts\activate   # or source .venv/bin/activate
python -m pytest tests/ -v
```

## Future Phases

| Phase | Scope |
|---|---|
| Phase 2 | Cricket ball-by-ball scoring over WebSocket |
| Phase 3 | Match ledger — stakes, automatic settlement |
| Phase 4 | Statistics engine — rankings, averages, streaks |
| Phase 5 | Tournaments — knockout, round robin, league |
| Phase 6 | Polish — Fun Records, admin panel, mobile app |

> See `MANDIR11-REFERENCE.md` for the full architectural specification.
