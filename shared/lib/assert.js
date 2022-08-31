'use strict';

function assert(value, message) {
  console.assert(value, message);
  if (!value) {
    throw new Error(`AssertionError: expected ${value} to be truthy`);
  }
}

module.exports = assert;
