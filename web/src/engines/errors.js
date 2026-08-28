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
