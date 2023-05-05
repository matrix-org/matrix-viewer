'use strict';

const NSFW_WORDS = ['nsfw', 'porn', 'nudes', 'sex', '18+'];
const NSFW_REGEXES = NSFW_WORDS.map((word) => new RegExp(`\\b${word}\\b`, 'i'));

function checkTextForNsfw(text) {
  const isNsfw = NSFW_REGEXES.some((regex) => regex.test(text));

  return isNsfw;
}

module.exports = checkTextForNsfw;
