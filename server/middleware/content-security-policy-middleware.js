'use strict';

const crypto = require('crypto');
const assert = require('assert');

const config = require('../lib/config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

function contentSecurityPolicyMiddleware(req, res, next) {
  const cspNonce = crypto.randomBytes(16).toString('hex');

  // Based on https://web.dev/strict-csp/
  const directives = [
    // Default to fully-restrictive and only allow what's needed below
    `default-src 'none';`,
    // Only <script> and <style> tags that have the nonce provided
    //
    // To ensure compatibility with very old browser versions (4+ years), we add
    // 'unsafe-inline' as a fallback. All recent browsers will ignore 'unsafe-inline' if
    // a CSP nonce or hash is present. (via
    // https://web.dev/strict-csp/#step-4-add-fallbacks-to-support-safari-and-older-browsers)
    `script-src 'nonce-${cspNonce}' 'strict-dynamic' https: 'unsafe-inline';`,
    // Hydrogen uses a bunch of inline styles and `style-src-attr` isn't well supported
    // in Firefox to allow it specifically. In the future, when it has better support we
    // should switch to a strict nonce based style directive.
    `style-src 'self' 'unsafe-inline';`,
    // We only need to load fonts from ourself
    `font-src 'self';`,
    // We only need to be able to load images/media from ourself and the homeserver media repo
    `img-src 'self' ${matrixServerUrl};`,
    `media-src 'self' ${matrixServerUrl};`,
    // Only allow the room directory search form to submit to ourself
    `form-action 'self';`,
    // We have no need ourself to embed in an iframe. And we shouldn't allow others to
    // iframe embed which can lead to clickjacking.  We also have the
    // `prevent-clickjacking-middleware` to cover this.
    `frame-ancestors 'none';`,
    // Extra restriction since we have no plans to change the `<base>`
    `base-uri 'self'`,
  ];

  res.set('Content-Security-Policy', directives.join(' '));

  // Make this available for down-stream routes to reference and use
  res.locals.cspNonce = cspNonce;

  next();
}

module.exports = contentSecurityPolicyMiddleware;
