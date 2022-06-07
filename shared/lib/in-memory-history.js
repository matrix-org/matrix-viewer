'use strict';

const { BaseObservableValue } = require('hydrogen-view-sdk');

// ex. https://hydrogen.element.io/#/session/123/room/!abc:matrix.org/lightbox/$abc
// and the hash is handling the `/session/123/room/!abc:matrix.org/lightbox/$abc` part
class InMemoryHistory extends BaseObservableValue {
  #hash = '#/session/123/room/!abc:matrix.org';

  get() {
    return this.#hash;
  }

  /** does not emit */
  replaceUrlSilently(url) {
    this.#hash = url;
  }

  /** does not emit */
  pushUrlSilently(url) {
    this.#hash = url;
  }

  pushUrl(url) {
    this.#hash = url;
  }

  urlAsPath(url) {
    if (url.startsWith('#')) {
      return url.substr(1);
    } else {
      return url;
    }
  }

  pathAsUrl(path) {
    return `#${path}`;
  }

  getLastUrl() {
    //throw new Error('Not implemented in InMemoryHistory');
    return this.#hash;
  }
}

module.exports = InMemoryHistory;
