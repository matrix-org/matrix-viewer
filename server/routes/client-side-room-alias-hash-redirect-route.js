'use strict';

const assert = require('assert');
const urlJoin = require('url-join');
const sanitizeHtml = require('../lib/sanitize-html');
const renderPageHtml = require('../hydrogen-render/render-page-html');

const config = require('../lib/config');
const basePath = config.get('basePath');
assert(basePath);

// Since everything after the hash (`#`) won't make it to the server, let's serve a 404
// page that will potentially redirect them to the correct place if they tried
// `/r/#room-alias:server/date/2022/10/27` -> `/r/room-alias:server/date/2022/10/27`
function clientSideRoomAliasHashRedirectRoute(req, res) {
  const pageOptions = {
    title: `Page not found - Matrix Public Archive`,
    entryPoint: 'client/js/entry-client-room-alias-hash-redirect.js',
    locationHref: urlJoin(basePath, req.originalUrl),
    // We don't have a Matrix room so we don't know whether or not to index. Just choose
    // a safe-default of false.
    shouldIndex: false,
    cspNonce: res.locals.cspNonce,
  };

  const bodyHtml = `
    <h1>
      404: Page not found.
      <span class="js-try-redirect-message" style="display: none">One sec while we try to redirect you to the right place.</span>
    </h1>
    <p>If there was a #room_alias:server hash in the URL, we tried redirecting  you to the right place.</p>
    <p>
      Otherwise, you're simply in a place that does not exist.
      You can ${sanitizeHtml(`<a href="${basePath}">go back to the homepage</a>.`)}
    </p>
    `;

  const pageHtml = renderPageHtml({
    pageOptions,
    bodyHtml,
    vmRenderContext: {
      config: {
        basePath,
      },
    },
  });

  res.status(404);
  res.set('Content-Type', 'text/html');
  res.send(pageHtml);
}

module.exports = clientSideRoomAliasHashRedirectRoute;
