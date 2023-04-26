'use strict';

const assert = require('assert');

const getDependenciesForEntryPointName = require('../lib/get-dependencies-for-entry-point-name');

// Set some preload link headers which we can use with Cloudflare to turn into 103 early
// hints, https://developers.cloudflare.com/cache/about/early-hints/
//
// This will turn into a nice speed-up since the server side render can take some time
// while we fetch all the information from the homeserver and the page can have all of
// the assets loaded and ready to go by that time. This way there is no extra delay
// after the page gets served.
function setHeadersToPreloadAssets(res, pageOptions) {
  assert(res);
  assert(pageOptions);
  assert(pageOptions.entryPoint);

  const { styles, preloadScripts } = getDependenciesForEntryPointName(pageOptions.entryPoint);

  // XXX: Should we add `nopush` to the `Link` headers here? Many servers initiate an
  // HTTP/2 Server Push when they encounter a preload link in HTTP header form
  // otherwise. Do we want/care about that (or maybe we don't)? (mentioned in
  // https://medium.com/reloading/preload-prefetch-and-priorities-in-chrome-776165961bbf#6f54)

  const styleLinks = styles.map((styleUrl) => {
    return `<${styleUrl}>; rel=preload; as=style`;
  });

  // TODO: We should preload fonts as well.
  //
  // We use `cors` because fonts are fetched with "CORS mode 'cors'" (see
  // https://drafts.csswg.org/css-fonts/#font-fetching-requirements) TODO: Should this
  // be `cors` or `crossorigin`?
  // https://www.smashingmagazine.com/2016/02/preload-what-is-it-good-for/#headers shows
  // `crossorigin` but the spec says `cors` so I'm not sure.
  //
  // `Link: </foo-url>; rel=preload; as=font; cors`

  // We use `rel=modulepreload` instead of `rel=preload` for the JavaScript modules
  // because it's a nice dedicated thing to handle ESM modules that not only downloads
  // and puts it in the cache like a normal `rel=preload` but the browser also knows
  // it's a JavaScript module now and can parse/compile it so it's ready to go.
  //
  // Also as a note: `<script type="module">` with no `crossorigin` attribute indicates
  // a credentials mode of `omit` so you will run into CORS issues with a naive `Link:
  // </foo-url>; rel=preload; as=script;` because it defaults to `same-origin` and there
  // is a mismatch (see
  // https://html.spec.whatwg.org/multipage/links.html#link-type-preload ->
  // https://fetch.spec.whatwg.org/#concept-request-credentials-mode). We could set the
  // credentials mode to match using `rel=preload; as=script; omit` but then we lose the
  // extra parse/compile step that `rel=modulepreload` gives.
  //
  // See https://developer.chrome.com/blog/modulepreload/#ok-so-why-doesnt-link-relpreload-work-for-modules
  // Spec: https://html.spec.whatwg.org/multipage/links.html#link-type-modulepreload
  const scriptLinks = preloadScripts.map((scriptUrl) => {
    return `<${scriptUrl}>; rel=modulepreload`;
  });

  res.append('Link', [].concat(styleLinks, scriptLinks).join(', '));
}

module.exports = setHeadersToPreloadAssets;
