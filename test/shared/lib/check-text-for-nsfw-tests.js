'use strict';

const assert = require('assert');

const checkTextForNsfw = require('matrix-public-archive-shared/lib/check-text-for-nsfw');

describe('checkTextForNsfw', () => {
  Object.entries({
    nsfw: true,
    'foo NSFW bar': true,
    foo_NSFW_bar: true,
    'foo:NSFW:bar': true,
    NSFW_foo: true,
    'NSFW-foo': true,
    'NSFW:foo': true,
  }).forEach(([inputText, expectedNsfw]) => {
    it(`should return ${expectedNsfw} for '${inputText}'`, () => {
      assert.strictEqual(
        checkTextForNsfw(inputText),
        expectedNsfw,
        `expected checkTextForNsfw('${inputText}') to be ${expectedNsfw}`
      );
    });
  });
});
