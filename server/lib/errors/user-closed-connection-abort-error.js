'use strict';

const ExtendedError = require('./extended-error');

class UserClosedConnectionAbortError extends ExtendedError {
  // ...
}

module.exports = UserClosedConnectionAbortError;
