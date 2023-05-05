'use strict';

const NSFW_WORDS = ['nsfw', 'porn', 'nudes', 'sex', '18+'];
const NSFW_REGEXES = NSFW_WORDS.map((word) => new RegExp(`\\b${word}\\b`, 'i'));

// A very basic check for NSFW content that just looks for some keywords in the given
// text
function checkTextForNsfw(text) {
  const isNsfw = NSFW_REGEXES.some((regex) => regex.test(text));

  return isNsfw;
}

module.exports = checkTextForNsfw;
