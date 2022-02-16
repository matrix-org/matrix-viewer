'use strict';

function assert(value, message) {
  console.assert(value, message);
  if (!value) {
    throw new Error(`Assertion Error: ${value} == true`);
  }
}

module.exports = assert;
