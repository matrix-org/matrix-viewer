'use strict';

const { History } = require('hydrogen-view-sdk');
const assert = require('./assert');

class ArchiveHistory extends History {
  constructor(roomId) {
    super();

    assert(roomId);
    this._baseHash = `#/session/123/room/${roomId}`;
  }

  get() {
    const hash = super.get()?.replace(/^#/, '') ?? '';
    return this._baseHash + hash;
  }

  replaceUrlSilently(url) {
    // We don't need to do this when server-side rendering in Node.js
    // because we the #hash is not available to servers.
    if (window.history) {
      super.replaceUrlSilently(url);
    }
  }

  pathAsUrl(path) {
    // FIXME: When closing the modal it reloads the page instead of SPA because
    // this makes `href=""` for the close button.
    const leftoverPath = super.pathAsUrl(path).replace(this._baseHash, '');
    if (leftoverPath.length) {
      return `#${leftoverPath}`;
    }
    return leftoverPath;
  }
}

module.exports = ArchiveHistory;
