'use strict';

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

async function timeoutMiddleware(req, res, next) {
  setTimeout(() => {
    const traceId = getActiveTraceId();
    const serializableSpans = getSerializableSpans();
    const serializedSpans = JSON.stringify(serializableSpans);

    const humanReadableSpans = serializableSpans.map((serializableSpan) => {
      const method = serializableSpan.attributes['http.method'];
      const url = serializableSpan.attributes['http.url'];
      const statusCode = serializableSpan.attributes['http.status_code'];

      let durationString = 'request is still running';
      if (serializableSpan.durationInMs) {
        durationString = `took ${serializableSpan.durationInMs}ms`;
      }

      return `<li class="tracing-span-list-item">
        <div class="tracing-span-item-http-details">${statusCode ?? '🏃'}: ${method} ${url}</div>
        <div class="tracing-span-item-sub-details">${durationString}</div>
      </li>`;
    });

    const hydrogenStylesUrl = urlJoin(basePath, 'hydrogen-styles.css');
    const stylesUrl = urlJoin(basePath, 'styles.css');

    const pageHtml = `
    <!doctype html>
    <html lang="en">
      <head>
        <title>Server timeout - Matrix Public Archive</title>
        <link href="${hydrogenStylesUrl}" rel="stylesheet">
        <link href="${stylesUrl}" rel="stylesheet">
      </head>
      ${/* We add the .hydrogen class here just to get normal body styles */ ''}
      <body class="hydrogen">
        <h1>504: Server timeout</h1>
        <p>Server was unable to respond in time</p>
        <h3>These are the external API requests that made it slow:</h3>
        ${sanitizeHtml(`<ul class="tracing-span-list">
          ${humanReadableSpans.join('\n')}
        </ul>`)}

        ${sanitizeHtml(`<h2>Trace ID: <span class="heading-sub-detail">${traceId}</span></h2>`)}

        <script type="text/javascript">window.tracingSpansForRequest = ${safeJson(
          serializedSpans
        )};</script>
      </body>
    </html>
    `;

    // 504 Gateway timeout
    res.status(504);
    res.set('Content-Type', 'text/html');

    res.send(pageHtml);
  }, requestTimeoutMs);

  next();
}

module.exports = asyncHandler(timeoutMiddleware);
