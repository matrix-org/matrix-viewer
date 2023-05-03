'use strict';

const assert = require('./assert');

const LOCAL_STORAGE_KEYS = {
  addedHomeservers: 'addedHomeservers',
  safeSearchEnabled: 'safeSearchEnabled',
  debugActiveDateIntersectionObserver: 'debugActiveDateIntersectionObserver',
};

// Just make sure they match for sanity. All we really care about is that they are
// unique amongst each other.
Object.keys(LOCAL_STORAGE_KEYS).every((key) => {
  const value = LOCAL_STORAGE_KEYS[key];
  const doesKeyMatchValue = key === value;
  assert(
    doesKeyMatchValue,
    `LOCAL_STORAGE_KEYS should have keys that are the same as their values for sanity but saw ${key}=${value}.`
  );
});

// Make sure all of the keys/values are unique
assert(
  new Set(Object.values(LOCAL_STORAGE_KEYS)).length !== Object.values(LOCAL_STORAGE_KEYS).length,
  'Duplicate values in LOCAL_STORAGE_KEYS. They should be unique otherwise ' +
    'there will be collisions and LocalStorage will be overwritten.'
);

module.exports = LOCAL_STORAGE_KEYS;
