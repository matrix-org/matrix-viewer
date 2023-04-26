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

  const { styles, fonts, images, preloadScripts } = getDependenciesForEntryPointName(
    pageOptions.entryPoint
  );

  // Work on assembling the `Link` headers
  //
  // Note: Any docs for the `<link>` element apply to the `Link` header. "The `Link`
  // header contains parameters [that] are equivalent to attributes of the `<link>`
  // element."
  // (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Link#parameters)
  //
  // XXX: Should we add `nopush` to the `Link` headers here? Many servers initiate an
  // HTTP/2 Server Push when they encounter a preload link in HTTP header form
  // otherwise. Do we want/care about that (or maybe we don't)? (mentioned in
  // https://medium.com/reloading/preload-prefetch-and-priorities-in-chrome-776165961bbf#6f54)

  const styleLinks = styles.map((styleUrl) => {
    return `<${styleUrl}>; rel=preload; as=style`;
  });

  // We use `crossorigin` because fonts are fetched with anonymous mode "cors" and
  // "same-origin" credentials mode (see
  // https://drafts.csswg.org/css-fonts/#font-fetching-requirements). `crossorigin` is
  // just short-hand for `crossorigin=anonymous` (see
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/crossorigin and
  // https://html.spec.whatwg.org/multipage/infrastructure.html#cors-settings-attribute).
  const fontLinks = fonts.map((fontUrl) => {
    return `<${fontUrl}>; rel=preload; as=font; crossorigin`;
  });

  const imageLinks = images.map((imageUrl) => {
    return `<${imageUrl}>; rel=preload; as=image`;
  });

  // We use `rel=modulepreload` instead of `rel=preload` for the JavaScript modules
  // because it's a nice dedicated thing to handle ESM modules that not only downloads
  // and puts it in the cache like a normal `rel=preload` but the browser also knows
  // it's a JavaScript module now and can parse/compile it so it's ready to go.
  //
  // Also as a note: `<script type="module">` with no `crossorigin` attribute
  // indicates a credentials mode of `omit` so you will run into CORS issues with a
  // naive `Link: <thing_to_load.js>; rel=preload; as=script;` because it defaults to
  // `same-origin` and there is a mismatch. (see
  // https://developer.chrome.com/blog/modulepreload/#ok-so-why-doesnt-link-relpreload-work-for-modules)
  // (and spec: https://html.spec.whatwg.org/multipage/links.html#link-type-preload ->
  // https://fetch.spec.whatwg.org/#concept-request-credentials-mode). There isn't a way
  // to make the link match `omit`. You could update both the link and `<script
  // type="module">` to one of the other `crossorigin` values though.
  //
  // Spec: https://html.spec.whatwg.org/multipage/links.html#link-type-modulepreload
  const scriptLinks = preloadScripts.map((scriptUrl) => {
    return `<${scriptUrl}>; rel=modulepreload`;
  });

  res.append('Link', [].concat(styleLinks, fontLinks, imageLinks, scriptLinks).join(', '));
}

module.exports = setHeadersToPreloadAssets;
