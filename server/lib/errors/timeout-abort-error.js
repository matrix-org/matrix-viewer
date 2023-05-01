'use strict';

const ExtendedError = require('./extended-error');

class TimeoutAbortError extends ExtendedError {
  // ...
}

module.exports = TimeoutAbortError;
