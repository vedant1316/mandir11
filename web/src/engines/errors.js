export class MatchEngineError extends Error {
  constructor(detail, statusCode = 400) {
    super(detail);
    this.name = 'MatchEngineError';
    this.detail = detail;
    this.statusCode = statusCode;
    this.response = {
      status: statusCode,
      data: { detail },
    };
  }
}

export class MatchNotFoundError extends MatchEngineError {
  constructor(detail = 'Match not found.') {
    super(detail, 404);
    this.name = 'MatchNotFoundError';
  }
}

export class PlayerNotFoundError extends MatchEngineError {
  constructor(detail = 'Player not found.') {
    super(detail, 404);
    this.name = 'PlayerNotFoundError';
  }
}

export class MatchStateError extends MatchEngineError {
  constructor(detail = 'Invalid match state transition.') {
    super(detail, 409);
    this.name = 'MatchStateError';
  }
}

export class TeamValidationError extends MatchEngineError {
  constructor(detail = 'Invalid team configuration.') {
    super(detail, 422);
    this.name = 'TeamValidationError';
  }
}

export class ResultValidationError extends MatchEngineError {
  constructor(detail = 'Invalid result data.') {
    super(detail, 422);
    this.name = 'ResultValidationError';
  }
}

export class CricketScorerError extends MatchEngineError {
  constructor(detail = 'Cricket scoring error.', statusCode = 400) {
    super(detail, statusCode);
    this.name = 'CricketScorerError';
  }
}

export class InningsClosedError extends CricketScorerError {
  constructor(detail = 'Innings is closed. Cannot score further deliveries.') {
    super(detail, 409);
    this.name = 'InningsClosedError';
  }
}

export class IllegalBowlerError extends CricketScorerError {
  constructor(detail = 'Invalid bowler selection.') {
    super(detail, 422);
    this.name = 'IllegalBowlerError';
  }
}

export class InvalidDeliveryError extends CricketScorerError {
  constructor(detail = 'Invalid delivery parameters.') {
    super(detail, 422);
    this.name = 'InvalidDeliveryError';
  }
}

export class LedgerError extends MatchEngineError {
  constructor(detail = 'Ledger error.', statusCode = 400) {
    super(detail, statusCode);
    this.name = 'LedgerError';
  }
}

export class UnbalancedStakesError extends LedgerError {
  constructor(detail = 'Total stakes on Team A must equal total stakes on Team B.') {
    super(detail, 422);
    this.name = 'UnbalancedStakesError';
  }
}

export class InvalidStakeAmountError extends LedgerError {
  constructor(detail = 'Stake amount must be a positive number greater than zero.') {
    super(detail, 422);
    this.name = 'InvalidStakeAmountError';
  }
}

export class InvalidStakeParticipantError extends LedgerError {
  constructor(detail = 'Stake participants must be assigned to opposing teams.') {
    super(detail, 422);
    this.name = 'InvalidStakeParticipantError';
  }
}

export class TournamentError extends MatchEngineError {
  constructor(detail = 'Tournament error.', statusCode = 400) {
    super(detail, statusCode);
    this.name = 'TournamentError';
  }
}

export class TournamentNotFoundError extends TournamentError {
  constructor(detail = 'Tournament not found.') {
    super(detail, 404);
    this.name = 'TournamentNotFoundError';
  }
}

export class FixtureNotFoundError extends TournamentError {
  constructor(detail = 'Fixture not found.') {
    super(detail, 404);
    this.name = 'FixtureNotFoundError';
  }
}

export class TournamentValidationError extends TournamentError {
  constructor(detail = 'Invalid tournament configuration.') {
    super(detail, 422);
    this.name = 'TournamentValidationError';
  }
}

export class BackupError extends MatchEngineError {
  constructor(detail = 'Backup error.', statusCode = 400) {
    super(detail, statusCode);
    this.name = 'BackupError';
  }
}

export class BackupValidationError extends BackupError {
  constructor(detail = 'Invalid backup structure or format.') {
    super(detail, 422);
    this.name = 'BackupValidationError';
  }
}




