'use strict';

class MockLocalStorage {
  constructor() {
    this._map = new Map();
  }

  getItem(key) {
    return this._map.get(key) || null;
  }

  setItem(key, value) {
    this._map.set(key, value);
  }

  removeItem(key) {
    this._map.delete(key);
  }

  get length() {
    return this._map.size;
  }

  key(n) {
    const it = this._map.keys();
    let i = -1;
    let result;
    while (i < n) {
      result = it.next();
      if (result.done) {
        return null;
      }
      i += 1;
    }
    return result?.value || null;
  }
}

module.exports = MockLocalStorage;
