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

