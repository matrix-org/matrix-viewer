'use strict';

// Standard error extender from @deployable/errors
// (https://github.com/deployable/deployable-errors)
class ExtendedError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error(message).stack;
    }
  }
}

module.exports = ExtendedError;
