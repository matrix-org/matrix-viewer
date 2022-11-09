'use strict';

const assert = require('assert');

const { getSerializableSpans } = require('../tracing/tracing-middleware');
const renderHydrogenToString = require('../hydrogen-render/render-hydrogen-to-string');
const sanitizeHtml = require('../lib/sanitize-html');
const safeJson = require('../lib/safe-json');

async function renderHydrogenVmRenderScriptToPageHtml(
  vmRenderScriptFilePath,
  vmRenderContext,
  pageOptions
) {
  assert(vmRenderScriptFilePath);
  assert(vmRenderContext);
  assert(pageOptions);
  assert(pageOptions.title);
  assert(pageOptions.styles);
  assert(pageOptions.scripts);
  assert(pageOptions.cspNonce);

  const hydrogenHtmlOutput = await renderHydrogenToString({
    vmRenderScriptFilePath,
    vmRenderContext,
    pageOptions,
  });

  // Serialize the state for when we run the Hydrogen render again client-side to
  // re-hydrate the DOM
  const serializedMatrixPublicArchiveContext = JSON.stringify({
    ...vmRenderContext,
  });

  const serializableSpans = getSerializableSpans();
  const serializedSpans = JSON.stringify(serializableSpans);

  // We shouldn't let some pages be indexed by search engines
  let maybeNoIndexHtml = '';
  if (!pageOptions.shouldIndex) {
    maybeNoIndexHtml = `<meta name="robots" content="noindex, nofollow" />`;
  }

  const pageHtml = `
      <!doctype html>
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          ${maybeNoIndexHtml}
          ${sanitizeHtml(`<title>${pageOptions.title}</title>`)}
          ${pageOptions.styles
            .map(
              (styleUrl) =>
                `<link href="${styleUrl}" rel="stylesheet" nonce="${pageOptions.cspNonce}">`
            )
            .join('\n')}
        </head>
        <body>
          ${hydrogenHtmlOutput}

          <script type="text/javascript" nonce="${pageOptions.cspNonce}">
            const qs = new URLSearchParams(window?.location?.search);
            const scrollStartEventId = qs.get('at');

            if (scrollStartEventId) {
              const eventElement = document.querySelector(\`[data-event-id="\${scrollStartEventId}"]\`);
              requestAnimationFrame(() => {
                eventElement.scrollIntoView({ block: 'center' });
              });
            } else  {
              const bottomHandleElement = document.querySelector('.js-bottom-scroll-handle');
              requestAnimationFrame(() => {
                bottomHandleElement.scrollIntoView({ block: 'end' });
              });
            }
          </script>

          <script type="text/javascript" nonce="${pageOptions.cspNonce}">
            window.matrixPublicArchiveContext = ${safeJson(serializedMatrixPublicArchiveContext)}
          </script>

          ${pageOptions.scripts
            .map(
              (scriptUrl) =>
                `<script type="text/javascript" src="${scriptUrl}" nonce="${pageOptions.cspNonce}"></script>`
            )
            .join('\n')}
          <script type="text/javascript" nonce="${pageOptions.cspNonce}">
            window.tracingSpansForRequest = ${safeJson(serializedSpans)};
          </script>
        </body>
      </html>
      `;

  return pageHtml;
}

module.exports = renderHydrogenVmRenderScriptToPageHtml;
