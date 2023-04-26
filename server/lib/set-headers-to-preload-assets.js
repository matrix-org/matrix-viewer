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

  // We use `nopush` because many servers initiate an HTTP/2 Server Push when they
  // encounter a preload link in HTTP header form otherwise. And we don't want HTTP/2
  // because idk.
  const styleLinks = styles.map((styleUrl) => {
    return `<${styleUrl}>; rel=preload; as=style; nopush`;
  });

  const scriptLinks = preloadScripts.map((scriptUrl) => {
    return `<${scriptUrl}>; rel=preload; as=script; nopush`;
  });

  res.append('Link', [].concat(styleLinks, scriptLinks).join(', '));
}

module.exports = setHeadersToPreloadAssets;
