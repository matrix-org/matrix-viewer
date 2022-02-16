'use strict';

const path = require('path');

// via https://javascript.plainenglish.io/how-to-safely-concatenate-url-with-node-js-f6527b623d5
function urlJoin(baseUrl, ...pathParts) {
  const fullUrl = new URL(path.join(...pathParts), baseUrl).toString();
  return fullUrl;
}

module.exports = urlJoin;
