'use strict';

const crypto = require('crypto');
const assert = require('assert');

const config = require('../lib/config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

function contentSecurityPolicyMiddleware(req, res, next) {
  const nonce = crypto.randomBytes(16).toString('hex');

  // Based on https://web.dev/strict-csp/
  const directives = [
    // Default to fully-restrictive and only allow what's needed below
    `default-src 'none';`,
    // Only only <script> and <style> tags that have the nonce provided
    //
    // To ensure compatibility with very old browser versions (4+ years), we add
    // 'unsafe-inline' as a fallback. All recent browsers will ignore 'unsafe-inline' if
    // a CSP nonce or hash is present. (via
    // https://web.dev/strict-csp/#step-4-add-fallbacks-to-support-safari-and-older-browsers)
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline';`,
    `style-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline';`,
    // Hydrogen uses a bunch of inline styles
    `style-src-attr 'unsafe-inline';`,
    // We only need to load fonts from ourself
    `font-src 'self';`,
    // We only need to be able to load images/media from ourself and the homeserver media repo
    `img-src 'self' ${matrixServerUrl};`,
    `media-src 'self' ${matrixServerUrl};`,
    // It seems like we would also need the `form-action` directive but since we don't
    // use any `action` on the room directory search form, it seems to work without
    // needing to allow it here.
  ];

  res.set('Content-Security-Policy', directives.join(' '));

  // Make this available for down-stream routes to use
  res.locals.nonce = nonce;

  next();
}

module.exports = contentSecurityPolicyMiddleware;
