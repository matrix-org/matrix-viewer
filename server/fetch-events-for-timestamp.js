const assert = require('assert');
const fetch = require('node-fetch');

const urlJoin = require('./lib/url-join');

const { matrixServerUrl } = require('../config.json');
const secrets = require('../secrets.json');

const matrixAccessToken = secrets.matrixAccessToken;
assert(matrixAccessToken);

class HTTPResponseError extends Error {
  constructor(response, responseText, ...args) {
    super(
      `HTTP Error Response: ${response.status} ${response.statusText}: ${responseText}\n    URL=${response.url}`,
      ...args
    );
    this.response = response;
  }
}

const checkStatus = async (response) => {
  if (response.ok) {
    // response.status >= 200 && response.status < 300
    return response;
  } else {
    const responseText = await response.text();
    throw new HTTPResponseError(response, responseText);
  }
};

async function fetchEndpoint(endpoint) {
  const res = await fetch(endpoint, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${matrixAccessToken}`,
    },
  });
  await checkStatus(res);
  const data = await res.json();
  return data;
}

async function fetchEventsForTimestamp(roomId, ts) {
  assert(roomId);
  assert(ts);

  const timestampToEventEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/unstable/org.matrix.msc3030/rooms/${roomId}/timestamp_to_event?ts=${ts}&dir=f`
  );
  const timestampToEventResData = await fetchEndpoint(timestampToEventEndpoint);
  //console.log('timestampToEventResData', timestampToEventResData);

  const eventIdForTimestamp = timestampToEventResData.event_id;
  assert(eventIdForTimestamp);

  const contextEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${roomId}/context/${eventIdForTimestamp}?limit=0`
  );
  const contextResData = await fetchEndpoint(contextEndpoint);
  //console.log('contextResData', contextResData);

  const messagesEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${roomId}/messages?from=${contextResData.start}&limit=50&filter={"lazy_load_members":true,"include_redundant_members":true}`
  );
  const messageResData = await fetchEndpoint(messagesEndpoint);
  //console.log('messageResData', messageResData);

  //console.log('messageResData.state', messageResData.state);
  const stateEventMap = {};
  for (const stateEvent of messageResData.state) {
    if (stateEvent.type === 'm.room.member') {
      stateEventMap[stateEvent.state_key] = stateEvent;
    }
  }

  return {
    stateEventMap,
    events: messageResData.chunk,
  };
}

module.exports = fetchEventsForTimestamp;
