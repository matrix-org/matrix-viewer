'use strict';

const { History } = require('hydrogen-view-sdk');
const assert = require('./assert');

// Mock a full hash whenever someone asks via `history.get()` but when
// constructing URL's for use `href` etc, they should relative to the room
// (remove session and room from the hash).
class MatrixViewerHistory extends History {
  constructor(baseHash) {
    assert(baseHash);
    super();

    this._baseHash = baseHash;
  }

  // Even though the page hash is relative to the room, we still expose the full
  // hash for Hydrogen to route things internally as expected.
  get() {
    const documentHash = document?.location?.hash;
    const hash = documentHash?.replace(/^#/, '') ?? '';
    return this._baseHash + hash;
  }

  replaceUrlSilently(url) {
    // We don't need to do this when server-side rendering in Node.js because
    // the #hash is not available to servers. This will be called as a
    // downstream call of `urlRouter.attach()` which we do when bootstraping
    // everything.
    if (window.history) {
      let replacingUrl;
      // Hydrogen hash routing on the end of the URL
      if (url.startsWith('#')) {
        replacingUrl = url;
      }
      // Hydrogen hash routing: This is the sign that Hydrogen is navigating back to the
      // root. Because of our custom Matrix Viewer logic, the `#` is removed before it gets
      // here. But we just want to make sure the hash gets cleared out while maintaining
      // our path and query parameters.
      //
      // Before: /foo?search=bar#/developer-options
      // pushUrlSilently(url='')
      // After: /foo?search=bar
      else if (url === '') {
        replacingUrl = document?.location?.pathname + document?.location?.search;
      }
      // Otherwise, it's probably an absolute URL that we can totally replace the page
      // URL with
      else {
        replacingUrl = url;
      }
      super.replaceUrlSilently(replacingUrl);
    }
  }

  pushUrlSilently(url) {
    let replacingUrl;
    // Hydrogen hash routing on the end of the URL
    if (url.startsWith('#')) {
      replacingUrl = url;
    }
    // Hydrogen hash routing: This is the sign that Hydrogen is navigating back to the
    // root. Because of our custom Matrix Viewer logic, the `#` is removed before it gets
    // here. But we just want to make sure the hash gets cleared out while maintaining
    // our path and query parameters.
    //
    // Before: /foo?search=bar#/developer-options
    // pushUrlSilently(url='')
    // After: /foo?search=bar
    else if (url === '') {
      replacingUrl = document?.location?.pathname + document?.location?.search;
    }
    // Otherwise, it's probably an absolute URL that we can totally replace the page
    // URL with
    else {
      replacingUrl = url;
    }
    super.pushUrlSilently(replacingUrl);
  }

  // Make the URLs we use in the UI of the app relative to the room:
  // Before: #/session/123/room/!HBehERstyQBxyJDLfR:my.synapse.server/lightbox/$17cgP6YBP9ny9xuU1vBmpOYFhRG4zpOe9SOgWi2Wxsk
  // After: #/lightbox/$17cgP6YBP9ny9xuU1vBmpOYFhRG4zpOe9SOgWi2Wxsk
  pathAsUrl(path) {
    const leftoverPath = super.pathAsUrl(path).replace(this._baseHash, '');
    // Only add back the hash when there is hash content beyond the base so we
    // don't end up with an extraneous `#` on the end of the URL. This will end
    // up creating some `<a href="">` (anchors with a blank href) but we have
    // some code to clean this up, see `supressBlankAnchorsReloadingThePage`.
    if (leftoverPath.length) {
      return `#${leftoverPath}`;
    }
    return leftoverPath;
  }
}

module.exports = MatrixViewerHistory;
