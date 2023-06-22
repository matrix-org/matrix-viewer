'use strict';

const assert = require('assert');
const urlJoin = require('url-join');

const { getSerializableSpans } = require('../tracing/tracing-middleware');
const sanitizeHtml = require('../lib/sanitize-html');
const safeJson = require('../lib/safe-json');
const getDependenciesForEntryPointName = require('../lib/get-dependencies-for-entry-point-name');
const getAssetUrl = require('../lib/get-asset-url');

const config = require('../lib/config');
const basePath = config.get('basePath');
assert(basePath);

let _assetUrls;
function getAssetUrls() {
  // Probably not that much overhead but only calculate this once
  if (_assetUrls) {
    return _assetUrls;
  }

  _assetUrls = {
    faviconIco: getAssetUrl('client/img/favicon.ico'),
    faviconSvg: getAssetUrl('client/img/favicon.svg'),
    opengraphImage: getAssetUrl('client/img/matrix-public-archive-opengraph.png'),
  };
  return _assetUrls;
}

function renderPageHtml({
  pageOptions,
  // Make sure you sanitize this before passing it to us
  bodyHtml,
  vmRenderContext,
}) {
  assert(vmRenderContext);
  assert(pageOptions);
  assert(pageOptions.title);
  assert(pageOptions.description);
  assert(pageOptions.entryPoint);
  assert(pageOptions.cspNonce);

  const { styles, scripts } = getDependenciesForEntryPointName(pageOptions.entryPoint);

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
    maybeNoIndexHtml = `<meta name="robots" content="noindex, nofollow">`;
  }

  // We should tell search engines that some pages are NSFW, see
  // https://developers.google.com/search/docs/crawling-indexing/safesearch
  let maybeAdultMeta = '';
  if (pageOptions.blockedBySafeSearch) {
    maybeAdultMeta = `<meta name="rating" content="adult">`;
  }

  const pageAssetUrls = getAssetUrls();
  let metaImageUrl = urlJoin(basePath, pageAssetUrls.opengraphImage);
  if (pageOptions.imageUrl) {
    metaImageUrl = pageOptions.imageUrl;
  }

  let maybeRelCanonical = '';
  if (pageOptions.canonicalUrl) {
    maybeRelCanonical = sanitizeHtml(`<link rel="canonical" href="${pageOptions.canonicalUrl}">`);
  }

  const pageHtml = `
      <!doctype html>
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          ${maybeNoIndexHtml}
          ${maybeAdultMeta}
          ${sanitizeHtml(`<title>${pageOptions.title}</title>`)}
          ${sanitizeHtml(`<meta name="description" content="${pageOptions.description}">`)}
          ${sanitizeHtml(`<meta property="og:image" content="${metaImageUrl}">`)}
          <link rel="icon" href="${pageAssetUrls.faviconIco}" sizes="any">
          <link rel="icon" href="${pageAssetUrls.faviconSvg}" type="image/svg+xml">
          ${maybeRelCanonical}
          ${styles
            .map(
              (styleUrl) =>
                `<link href="${styleUrl}" rel="stylesheet" nonce="${pageOptions.cspNonce}">`
            )
            .join('\n')}
        </head>
        <body>
          ${bodyHtml}
          
          ${
            /**
             * This inline snippet is used in to scroll the Hydrogen timeline to the
             * right place immediately when the page loads instead of waiting for
             * Hydrogen to load, hydrate and finally scroll.
             */ ''
          }
          <script type="text/javascript" nonce="${pageOptions.cspNonce}">
const qs = new URLSearchParams(window?.location?.search);
const atEventId = qs.get('at');
if (atEventId) {
  const el = document.querySelector(\`[data-event-id="\${atEventId}"]\`);
  requestAnimationFrame(() => {
    el && el.scrollIntoView({ block: 'center' });
  });
} else {
  const el = document.querySelector('.js-bottom-scroll-anchor');
  requestAnimationFrame(() => {
    el && el.scrollIntoView({ block: 'end' });
  });
}
          </script>

          <script type="text/javascript" nonce="${pageOptions.cspNonce}">
            window.matrixPublicArchiveContext = ${safeJson(serializedMatrixPublicArchiveContext)}
          </script>

          ${scripts
            .map(
              (scriptUrl) =>
                `<script type="module" src="${scriptUrl}" nonce="${pageOptions.cspNonce}"></script>`
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

module.exports = renderPageHtml;
