import assert from 'assert';
import urlJoin from 'url-join';
import safeJson from '../lib/safe-json';
import sanitizeHtml from '../lib/sanitize-html';

import config from '../lib/config';
const basePath = config.get('basePath');
assert(basePath);

// Since everything after the hash (`#`) won't make it to the server, let's serve a 404
// page that will potentially redirect them to the correct place if they tried
// `/r/#room-alias:server/date/2022/10/27` -> `/r/room-alias:server/date/2022/10/27`
function clientSideRoomAliasHashRedirectRoute(req, res) {
  const cspNonce = res.locals.cspNonce;
  const hydrogenStylesUrl = urlJoin(basePath, '/hydrogen-assets/hydrogen-styles.css');
  const stylesUrl = urlJoin(basePath, '/css/styles.css');
  const jsBundleUrl = urlJoin(basePath, '/js/entry-client-room-alias-hash-redirect.es.js');

  const context = {
    config: {
      basePath,
    },
  };
  const serializedContext = JSON.stringify(context);

  const pageHtml = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Page not found - Matrix Public Archive</title>
        <link href="${hydrogenStylesUrl}" rel="stylesheet" nonce="${cspNonce}">
        <link href="${stylesUrl}" rel="stylesheet" nonce="${cspNonce}">
      </head>
      ${/* We add the .hydrogen class here just to get normal body styles */ ''}
      <body class="hydrogen">
        <h1>
          404: Page not found.
          <span class="js-try-redirect-message" style="display: none">One sec while we try to redirect you to the right place.</span>
        </h1>
        <p>If there was a #room_alias:server hash in the URL, we tried redirecting  you to the right place.</p>
        <p>
          Otherwise, you're simply in a place that does not exist.
          You can ${sanitizeHtml(`<a href="${basePath}">go back to the homepage</a>.`)}
        </p>

        <script type="text/javascript" nonce="${cspNonce}">
          window.matrixPublicArchiveContext = ${safeJson(serializedContext)}
        </script>
        <script type="text/javascript" src="${jsBundleUrl}" nonce="${cspNonce}"></script>
      </body>
    </html>
    `;

  res.status(404);
  res.set('Content-Type', 'text/html');
  res.send(pageHtml);
}

module.exports = clientSideRoomAliasHashRedirectRoute;
