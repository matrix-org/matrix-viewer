const assert = require('assert');
const urlJoin = require('url-join');
const asyncHandler = require('../lib/express-async-handler');
const { getSerializableSpans, getActiveTraceId } = require('../tracing/tracing-middleware');
const sanitizeHtml = require('../lib/sanitize-html');
const safeJson = require('../lib/safe-json');

const config = require('../lib/config');
const basePath = config.get('basePath');
assert(basePath);
const requestTimeoutMs = config.get('requestTimeoutMs');
assert(requestTimeoutMs);

// Based off of the `connect-timeout` middleware,
// https://github.com/expressjs/timeout/blob/f2f520f335f2f2ae255d4778e908e8d38e3a4e68/index.js
async function timeoutMiddleware(req, res, next) {
  const timeoutId = setTimeout(() => {
    const traceId = getActiveTraceId();
    const serializableSpans = getSerializableSpans();
    const serializedSpans = JSON.stringify(serializableSpans);

    let humanReadableSpans;
    if (serializableSpans.length > 0) {
      humanReadableSpans = serializableSpans.map((serializableSpan) => {
        const method = serializableSpan.attributes['http.method'];
        const url = serializableSpan.attributes['http.url'];
        const statusCode = serializableSpan.attributes['http.status_code'];

        let durationString = `request is still running (${
          Date.now() - serializableSpan.startTimeInMs
        }ms so far)`;
        if (serializableSpan.durationInMs) {
          durationString = `took ${serializableSpan.durationInMs}ms`;
        }

        return `<li class="tracing-span-list-item">
          <div class="tracing-span-item-http-details">${statusCode ?? '🏃'}: ${method} ${url}</div>
          <div class="tracing-span-item-sub-details">${durationString}</div>
        </li>`;
      });
    } else {
      const noTracingDataAvailableItem = `<li class="tracing-span-list-item">
        <div class="tracing-span-item-http-details">No tracing data available</div>
      </li>`;

      humanReadableSpans = [noTracingDataAvailableItem];
    }

    const cspNonce = res.locals.cspNonce;

    const hydrogenStylesUrl = urlJoin(basePath, '/hydrogen-assets/hydrogen-styles.css');
    const stylesUrl = urlJoin(basePath, '/css/styles.css');

    const pageHtml = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Server timeout - Matrix Public Archive</title>
        <link href="${hydrogenStylesUrl}" rel="stylesheet" nonce="${cspNonce}">
        <link href="${stylesUrl}" rel="stylesheet" nonce="${cspNonce}">
      </head>
      ${/* We add the .hydrogen class here just to get normal body styles */ ''}
      <body class="hydrogen">
        <h1>504: Server timeout</h1>
        <p>Server was unable to respond in time (${requestTimeoutMs / 1000}s)</p>
        <h3>These are the external API requests that made it slow:</h3>
        ${sanitizeHtml(`<ul class="tracing-span-list">
          ${humanReadableSpans.join('\n')}
        </ul>`)}

        ${sanitizeHtml(
          `<h2>Trace ID: <span class="heading-sub-detail">${
            traceId ?? `none (tracing is probably not enabled)`
          }</span></h2>`
        )}

        <script type="text/javascript" nonce="${cspNonce}">
          window.tracingSpansForRequest = ${safeJson(serializedSpans)};
        </script>
      </body>
    </html>
    `;

    // 504 Gateway timeout
    res.status(504);
    res.set('Content-Type', 'text/html');

    res.send(pageHtml);
  }, requestTimeoutMs);

  res.on('finish', function () {
    clearTimeout(timeoutId);
  });

  next();
}

module.exports = asyncHandler(timeoutMiddleware);
