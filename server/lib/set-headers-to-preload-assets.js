const assert = require('assert');

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

  const { styles, scripts } = pageOptions;

  const styleLinks = styles.map((styleUrl) => {
    return `<${styleUrl}>; rel=preload; as=style`;
  });

  const scriptLinks = scripts.map((scriptUrl) => {
    return `<${scriptUrl}>; rel=preload; as=script`;
  });

  res.append('Link', [].concat(styleLinks, scriptLinks).join(', '));
}

module.exports = setHeadersToPreloadAssets;
