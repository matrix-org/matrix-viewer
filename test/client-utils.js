'use strict';

const assert = require('assert');
const { URLSearchParams } = require('url');
const urlJoin = require('url-join');
const { fetchEndpointAsJson, fetchEndpoint } = require('../server/lib/fetch-endpoint');

const config = require('../server/lib/config');
const matrixAccessToken = config.get('matrixAccessToken');
assert(matrixAccessToken);

let txnCount = 0;
function getTxnId() {
  txnCount++;
  return `${new Date().getTime()}--${txnCount}`;
}

// Get client to act with for all of the client methods. This will use the
// application service access token and client methods will append `?user_id`
// for the specific user to act upon so we can use the `?ts` message timestamp
// massaging when sending.
async function getTestClientForHs(testMatrixServerUrl) {
  // Register the virtual user
  const username = `user-t${new Date().getTime()}-r${Math.floor(Math.random() * 1000000000)}`;
  const registerResponse = await fetchEndpointAsJson(
    urlJoin(testMatrixServerUrl, '/_matrix/client/v3/register'),
    {
      method: 'POST',
      body: {
        type: 'm.login.application_service',
        username,
      },
      accessToken: matrixAccessToken,
    }
  );

  const userId = registerResponse['user_id'];
  assert(userId);

  return {
    homeserverUrl: testMatrixServerUrl,
    // We use the application service AS token because we need to be able to use
    // the `?ts` timestamp massaging when sending events
    accessToken: matrixAccessToken,
    userId: userId,
  };
}

// Create a public room to test in
async function createTestRoom(client) {
  let qs = new URLSearchParams();
  if (client.userId) {
    qs.append('user_id', client.userId);
  }

  const createRoomResponse = await fetchEndpointAsJson(
    urlJoin(client.homeserverUrl, `/_matrix/client/v3/createRoom?${qs.toString()}`),
    {
      method: 'POST',
      body: {
        preset: 'public_chat',
        name: 'the hangout spot',
        initial_state: [
          {
            type: 'm.room.history_visibility',
            state_key: '',
            content: {
              history_visibility: 'world_readable',
            },
          },
        ],
      },
      accessToken: client.accessToken,
    }
  );

  const roomId = createRoomResponse['room_id'];
  assert(roomId);
  return roomId;
}

async function joinRoom({ client, roomId, viaServers }) {
  let qs = new URLSearchParams();
  if (viaServers) {
    [].concat(viaServers).forEach((viaServer) => {
      qs.append('server_name', viaServer);
    });
  }

  if (client.userId) {
    qs.append('user_id', client.userId);
  }

  const joinRoomResponse = await fetchEndpointAsJson(
    urlJoin(client.homeserverUrl, `/_matrix/client/v3/join/${roomId}?${qs.toString()}`),
    {
      method: 'POST',
      accessToken: client.accessToken,
    }
  );

  const joinedRoomId = joinRoomResponse['room_id'];
  assert(joinedRoomId);
  return joinedRoomId;
}

async function sendEvent({ client, roomId, eventType, content, timestamp }) {
  assert(client);
  assert(roomId);
  assert(content);

  let qs = new URLSearchParams();
  if (timestamp) {
    assert(
      timestamp && client.userId,
      'We can only do `?ts` massaging from an application service access token. ' +
        'Expected `client.userId` to be defined so we can act on behalf of that user'
    );

    qs.append('ts', timestamp);
  }

  if (client.userId) {
    qs.append('user_id', client.userId);
  }

  const sendResponse = await fetchEndpointAsJson(
    urlJoin(
      client.homeserverUrl,
      `/_matrix/client/v3/rooms/${roomId}/send/${eventType}/${getTxnId()}?${qs.toString()}`
    ),
    {
      method: 'PUT',
      body: content,
      accessToken: client.accessToken,
    }
  );

  const eventId = sendResponse['event_id'];
  assert(eventId);
  return eventId;
}

async function sendMessage({ client, roomId, content, timestamp }) {
  return sendEvent({ client, roomId, eventType: 'm.room.message', content, timestamp });
}

// Create a number of messages in the given room
async function createMessagesInRoom({ client, roomId, numMessages, prefix, timestamp }) {
  let eventIds = [];
  for (let i = 0; i < numMessages; i++) {
    const eventId = await sendMessage({
      client,
      roomId,
      content: {
        msgtype: 'm.text',
        body: `${prefix} - message${i}`,
      },
      timestamp,
    });
    eventIds.push(eventId);
  }

  return eventIds;
}

// Uploads the given data Buffer and returns the MXC URI of the uploaded content
async function uploadContent({ client, roomId, data, fileName, contentType }) {
  assert(client);
  assert(roomId);
  assert(data);

  let qs = new URLSearchParams();
  if (client.userId) {
    qs.append('user_id', client.userId);
  }

  if (fileName) {
    qs.append('filename', fileName);
  }

  // We don't want to use `fetchEndpointAsJson` here because it will
  // `JSON.stringify(...)` the body data
  const uploadResponse = await fetchEndpoint(
    urlJoin(client.homeserverUrl, `/_matrix/media/v3/upload`),
    {
      method: 'POST',
      body: data,
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
      },
      accessToken: client.accessToken,
    }
  );

  const uploadResponseData = await uploadResponse.json();

  const mxcUri = uploadResponseData['content_uri'];
  assert(mxcUri);
  return mxcUri;
}

module.exports = {
  getTestClientForHs,
  createTestRoom,
  joinRoom,
  sendEvent,
  sendMessage,
  createMessagesInRoom,
  uploadContent,
};
