'use strict';

class AssertionError extends Error {
  constructor(...params) {
    // Pass remaining arguments (including vendor specific ones) to parent constructor
    super(...params);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AssertionError);
    }

    this.name = 'AssertionError';
  }
}

function assert(value, message) {
  if (!value) {
    const error = new AssertionError(message || `expected ${value} to be truthy`);
    //console.error(error);
    throw error;
  }
}

module.exports = assert;
