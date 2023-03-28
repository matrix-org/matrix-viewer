'use strict';

const assert = require('assert');
const urlJoin = require('url-join');
const { fetchEndpointAsJson, fetchEndpoint } = require('../../server/lib/fetch-endpoint');

const config = require('../../server/lib/config');
const matrixAccessToken = config.get('matrixAccessToken');
assert(matrixAccessToken);
const testMatrixServerUrl1 = config.get('testMatrixServerUrl1');
assert(testMatrixServerUrl1);

let txnCount = 0;
function getTxnId() {
  txnCount++;
  return `${new Date().getTime()}--${txnCount}`;
}

// Basic slugify function, plenty of edge cases and should not be used for
// production.
function slugify(inputText) {
  return (
    inputText
      .toLowerCase()
      // Replace whitespace with hyphens
      .replace(/\s+/g, '-')
      // Remove anything not alpha-numeric or hypen
      .replace(/[^a-z0-9-]+/g, '')
  );
}

async function ensureUserRegistered({ matrixServerUrl, username }) {
  const { data: registerResponse } = await fetchEndpointAsJson(
    urlJoin(matrixServerUrl, '/_matrix/client/v3/register'),
    {
      method: 'POST',
      body: {
        type: 'm.login.dummy',
        username,
      },
    }
  );

  const userId = registerResponse['user_id'];
  assert(userId);
}

async function getTestClientForAs() {
  return {
    homeserverUrl: testMatrixServerUrl1,
    accessToken: matrixAccessToken,
    userId: '@archiver:hs1',
  };
}

// Get client to act with for all of the client methods. This will use the
// application service access token and client methods will append `?user_id`
// for the specific user to act upon so we can use the `?ts` message timestamp
// massaging when sending.
async function getTestClientForHs(testMatrixServerUrl) {
  // Register the virtual user
  const username = `user-t${new Date().getTime()}-r${Math.floor(Math.random() * 1000000000)}`;
  const { data: registerResponse } = await fetchEndpointAsJson(
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

  const applicationServiceUserIdOverride = registerResponse['user_id'];
  assert(applicationServiceUserIdOverride);

  return {
    homeserverUrl: testMatrixServerUrl,
    // We use the application service AS token because we need to be able to use
    // the `?ts` timestamp massaging when sending events
    accessToken: matrixAccessToken,
    userId: applicationServiceUserIdOverride,
    applicationServiceUserIdOverride,
  };
}

// Create a public room to test in
async function createTestRoom(client, overrideCreateOptions = {}) {
  let qs = new URLSearchParams();
  if (client.applicationServiceUserIdOverride) {
    qs.append('user_id', client.applicationServiceUserIdOverride);
  }

  const roomName = overrideCreateOptions.name || 'the hangout spot';
  const roomAlias = slugify(roomName + getTxnId());

  const { data: createRoomResponse } = await fetchEndpointAsJson(
    urlJoin(client.homeserverUrl, `/_matrix/client/v3/createRoom?${qs.toString()}`),
    {
      method: 'POST',
      body: {
        preset: 'public_chat',
        name: roomName,
        room_alias_name: roomAlias,
        initial_state: [
          {
            type: 'm.room.history_visibility',
            state_key: '',
            content: {
              history_visibility: 'world_readable',
            },
          },
        ],
        visibility: 'public',
        ...overrideCreateOptions,
      },
      accessToken: client.accessToken,
    }
  );

  const roomId = createRoomResponse['room_id'];
  assert(roomId);
  return roomId;
}

async function getCanonicalAlias({ client, roomId }) {
  const { data: stateCanonicalAliasRes } = await fetchEndpointAsJson(
    urlJoin(
      client.homeserverUrl,
      `_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/m.room.canonical_alias`
    ),
    {
      accessToken: client.accessToken,
    }
  );

  const canonicalAlias = stateCanonicalAliasRes.alias;
  assert(canonicalAlias, `getCanonicalAlias() did not return canonicalAlias as expected`);

  return canonicalAlias;
}

async function joinRoom({ client, roomId, viaServers }) {
  let qs = new URLSearchParams();
  if (viaServers) {
    [].concat(viaServers).forEach((viaServer) => {
      qs.append('server_name', viaServer);
    });
  }

  if (client.applicationServiceUserIdOverride) {
    qs.append('user_id', client.applicationServiceUserIdOverride);
  }

  const joinRoomUrl = urlJoin(
    client.homeserverUrl,
    `/_matrix/client/v3/join/${encodeURIComponent(roomId)}?${qs.toString()}`
  );
  const { data: joinRoomResponse } = await fetchEndpointAsJson(joinRoomUrl, {
    method: 'POST',
    accessToken: client.accessToken,
  });

  const joinedRoomId = joinRoomResponse['room_id'];
  assert(joinedRoomId);
  return joinedRoomId;
}

async function sendEvent({ client, roomId, eventType, stateKey, content, timestamp }) {
  assert(client);
  assert(roomId);
  assert(content);

  let qs = new URLSearchParams();
  if (timestamp) {
    assert(
      timestamp && client.applicationServiceUserIdOverride,
      'We can only do `?ts` massaging from an application service access token. ' +
        'Expected `client.applicationServiceUserIdOverride` to be defined so we can act on behalf of that user'
    );

    qs.append('ts', timestamp);
  }

  if (client.applicationServiceUserIdOverride) {
    qs.append('user_id', client.applicationServiceUserIdOverride);
  }

  let url;
  if (stateKey) {
    url = urlJoin(
      client.homeserverUrl,
      `/_matrix/client/v3/rooms/${encodeURIComponent(
        roomId
      )}/state/${eventType}/${stateKey}?${qs.toString()}`
    );
  } else {
    url = urlJoin(
      client.homeserverUrl,
      `/_matrix/client/v3/rooms/${encodeURIComponent(
        roomId
      )}/send/${eventType}/${getTxnId()}?${qs.toString()}`
    );
  }

  const { data: sendResponse } = await fetchEndpointAsJson(url, {
    method: 'PUT',
    body: content,
    accessToken: client.accessToken,
  });

  const eventId = sendResponse['event_id'];
  assert(eventId);
  return eventId;
}

async function sendMessage({ client, roomId, content, timestamp }) {
  return sendEvent({ client, roomId, eventType: 'm.room.message', content, timestamp });
}

// Create a number of messages in the given room
async function createMessagesInRoom({
  client,
  roomId,
  numMessages,
  prefix,
  timestamp,
  // The amount of time between each message
  increment = 1,
}) {
  let eventIds = [];
  let events = [];
  for (let i = 0; i < numMessages; i++) {
    const originServerTs = timestamp + i * increment;
    const content = {
      msgtype: 'm.text',
      body: `${prefix} - message${i}`,
    };
    const eventId = await sendMessage({
      client,
      roomId,
      content,
      // Technically, we don't have to set the timestamp to be unique or sequential but
      // it still seems like a good idea to make the tests more clear.
      timestamp: originServerTs,
    });
    eventIds.push(eventId);
    events.push({
      roomId,
      originServerTs,
      content,
    });
  }

  // Sanity check that we actually sent some messages
  assert.strictEqual(eventIds.length, numMessages);

  return { eventIds, events };
}

async function updateProfile({ client, displayName, avatarUrl }) {
  let qs = new URLSearchParams();
  if (client.applicationServiceUserIdOverride) {
    qs.append('user_id', client.applicationServiceUserIdOverride);
  }

  let updateDisplayNamePromise = Promise.resolve();
  if (displayName) {
    updateDisplayNamePromise = fetchEndpointAsJson(
      urlJoin(
        client.homeserverUrl,
        `/_matrix/client/v3/profile/${client.userId}/displayname?${qs.toString()}`
      ),
      {
        method: 'PUT',
        body: {
          displayname: displayName,
        },
        accessToken: client.accessToken,
      }
    );
  }

  let updateAvatarUrlPromise = Promise.resolve();
  if (avatarUrl) {
    updateAvatarUrlPromise = fetchEndpointAsJson(
      urlJoin(
        client.homeserverUrl,
        `/_matrix/client/v3/profile/${client.userId}/avatar_url?${qs.toString()}`
      ),
      {
        method: 'PUT',
        body: {
          avatar_url: avatarUrl,
        },
        accessToken: client.accessToken,
      }
    );
  }

  await Promise.all([updateDisplayNamePromise, updateAvatarUrlPromise]);

  return null;
}

// Uploads the given data Buffer and returns the MXC URI of the uploaded content
async function uploadContent({ client, roomId, data, fileName, contentType }) {
  assert(client);
  assert(roomId);
  assert(data);

  let qs = new URLSearchParams();
  if (client.applicationServiceUserIdOverride) {
    qs.append('user_id', client.applicationServiceUserIdOverride);
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
  ensureUserRegistered,
  getTestClientForAs,
  getTestClientForHs,
  createTestRoom,
  getCanonicalAlias,
  joinRoom,
  sendEvent,
  sendMessage,
  createMessagesInRoom,
  updateProfile,
  uploadContent,
};
