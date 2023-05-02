'use strict';

const ExtendedError = require('./extended-error');

class RouteTimeoutAbortError extends ExtendedError {
  // ...
}

module.exports = RouteTimeoutAbortError;
