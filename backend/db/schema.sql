-- Mandir 11 — PostgreSQL Production Schema
-- This file is the authoritative DDL for production deployments.
-- Local development uses SQLAlchemy ORM with SQLite; switch DATABASE_URL to use this.
--
-- Run with: psql -U <user> -d mandir11 -f schema.sql

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE sport_type       AS ENUM ('cricket', 'volleyball', 'badminton');
CREATE TYPE match_status     AS ENUM ('upcoming', 'live', 'completed', 'abandoned');
CREATE TYPE end_reason_type  AS ENUM ('completed', 'time', 'players_unavailable', 'rain', 'other');
CREATE TYPE team_label_type  AS ENUM ('Team A', 'Team B');
CREATE TYPE extra_type       AS ENUM ('none', 'wide', 'no_ball');
CREATE TYPE dismissal_type   AS ENUM ('bowled', 'caught', 'run_out', 'lbw', 'stumped', 'other');
CREATE TYPE tournament_format AS ENUM ('knockout', 'round_robin', 'league');
CREATE TYPE tournament_status AS ENUM ('upcoming', 'in_progress', 'completed');

-- ─── Players ─────────────────────────────────────────────────────────────────
CREATE TABLE players (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name      VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Admin Users ─────────────────────────────────────────────────────────────
CREATE TABLE admin_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tournaments ─────────────────────────────────────────────────────────────
CREATE TABLE tournaments (
    id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name   VARCHAR(100) NOT NULL,
    sport  sport_type NOT NULL,
    format tournament_format NOT NULL,
    status tournament_status NOT NULL DEFAULT 'upcoming',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Matches ─────────────────────────────────────────────────────────────────
CREATE TABLE matches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sport               sport_type NOT NULL,
    status              match_status NOT NULL DEFAULT 'upcoming',
    date                DATE NOT NULL DEFAULT CURRENT_DATE,
    tournament_id       UUID REFERENCES tournaments(id) ON DELETE SET NULL,
    fixture_id          UUID,  -- FK added when Fixture table exists
    end_reason          end_reason_type,
    player_of_match_id  UUID REFERENCES players(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Teams (scoped to one match — never reusable entities) ───────────────────
CREATE TABLE teams (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    label    team_label_type NOT NULL,
    UNIQUE (match_id, label)  -- exactly one Team A and one Team B per match
);

-- ─── Team Players ─────────────────────────────────────────────────────────────
CREATE TABLE team_players (
    team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    PRIMARY KEY (team_id, player_id)
);

-- Prevent the same player appearing in two teams in the same match.
-- Enforced at the application layer (Match Engine); a partial unique index
-- here would require a join — handled in match_engine.py instead.

-- ─── Match Results (Volleyball / Badminton) ───────────────────────────────────
CREATE TABLE match_results (
    match_id        UUID PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
    team_a_score    INTEGER,  -- nullable: badminton may not use numeric scores
    team_b_score    INTEGER,
    winning_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT
);

-- ─── Cricket (Phase 2) ────────────────────────────────────────────────────────
CREATE TABLE innings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    batting_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    innings_number  SMALLINT NOT NULL CHECK (innings_number IN (1, 2)),
    overs_limit     SMALLINT,
    total_runs      INTEGER NOT NULL DEFAULT 0,
    total_wickets   SMALLINT NOT NULL DEFAULT 0,
    is_closed       BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (match_id, innings_number)
);

CREATE TABLE overs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    innings_id  UUID NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
    over_number SMALLINT NOT NULL,
    bowler_id   UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    UNIQUE (innings_id, over_number)
);

CREATE TABLE balls (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    over_id             UUID NOT NULL REFERENCES overs(id) ON DELETE CASCADE,
    ball_number         SMALLINT NOT NULL,
    runs                SMALLINT NOT NULL DEFAULT 0,
    extra_type          extra_type NOT NULL DEFAULT 'none',
    is_wicket           BOOLEAN NOT NULL DEFAULT FALSE,
    dismissal_type      dismissal_type,
    batter_id           UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    dismissed_player_id UUID REFERENCES players(id) ON DELETE RESTRICT,
    next_batter_id      UUID REFERENCES players(id) ON DELETE RESTRICT,
    UNIQUE (over_id, ball_number)
);

-- ─── Ledger (Phase 3) ─────────────────────────────────────────────────────────
CREATE TABLE ledger_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_a_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    player_b_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Fixtures (Phase 5) ───────────────────────────────────────────────────────
CREATE TABLE fixtures (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_label   VARCHAR(50) NOT NULL,
    match_id      UUID REFERENCES matches(id) ON DELETE SET NULL,
    team_a_source TEXT,  -- e.g. "winner of fixture #3"
    team_b_source TEXT
);
