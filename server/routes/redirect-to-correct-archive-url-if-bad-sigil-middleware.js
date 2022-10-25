'use strict';

const assert = require('assert');
const escapeStringRegexp = require('escape-string-regexp');

const config = require('../lib/config');
const basePath = config.get('basePath');
assert(basePath);

const VALID_SIGIL_TO_ENTITY_DESCRIPTOR_MAP = {
  '#': 'r',
  '!': 'roomid',
};

// Correct any honest mistakes: If someone accidentally put the sigil in the URL, then
// redirect them to the correct URL without the sigil.
//
// Redirect examples:
// - `/roomid/!xxx:my.synapse.server` -> `/roomid/xxx:my.synapse.server`
// - `/roomid/!xxx:my.synapse.server/date/2022/09/20?via=my.synapse.server` -> `/roomid/xxx:my.synapse.server/date/2022/09/20?via=my.synapse.server`
// - `/!xxx:my.synapse.server` -> `/roomid/xxx:my.synapse.server`
function redirectToCorrectArchiveUrlIfBadSigilMiddleware(req, res, next) {
  // This could be with or with our without the sigil. Although the correct thing here
  // is to have no sigil. We will try to correct it for them in any case.
  const roomIdOrAliasDirty = req.params.roomIdOrAliasDirty;
  const roomIdOrAliasWithoutSigil = roomIdOrAliasDirty.replace(/^(#|!)/, '');

  if (
    roomIdOrAliasDirty.startsWith('!') ||
    // It isn't possible to put the room alias `#` in the URI since everything after a
    // `#` is only visible client-side but just put the logic here for clarity. We
    // handle this redirect on the client.
    roomIdOrAliasDirty.startsWith('#')
  ) {
    const sigil = roomIdOrAliasDirty[0];
    const entityDescriptor = VALID_SIGIL_TO_ENTITY_DESCRIPTOR_MAP[sigil];
    if (!entityDescriptor) {
      throw new Error(
        `Unknown sigil=${sigil} has no entityDescriptor. This is an error with the Matrix Public Archive itself (please open an issue).`
      );
    }

    const urlObj = new URL(req.originalUrl, basePath);
    const dirtyPathRegex = new RegExp(
      `(/(?:r|roomid))?/${escapeStringRegexp(roomIdOrAliasDirty)}(/?.*)`
    );
    urlObj.pathname = urlObj.pathname.replace(dirtyPathRegex, (_match, _beforePath, afterPath) => {
      return `/${entityDescriptor}/${encodeURIComponent(roomIdOrAliasWithoutSigil)}${afterPath}`;
    });

    res.redirect(301, urlObj.toString());
    return;
  }

  next();
}

module.exports = redirectToCorrectArchiveUrlIfBadSigilMiddleware;
