'use strict';

const assert = require('assert');

const fetchRoomId = require('./fetch-room-id');

const config = require('../config');
const basePath = config.get('basePath');
assert(basePath);
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

config.defaults({
  "enableAllowList": false,
  "roomAllowList": [],
});

async function checkIfAllowed(roomIdOrAlias) {
  if (!config.get("enableAllowList")) {
    return true;
  }
  const roomId = await fetchRoomId(roomIdOrAlias);
  const result = config.get("roomAllowList").includes(roomId)
  return result;
}

module.exports = checkIfAllowed;
