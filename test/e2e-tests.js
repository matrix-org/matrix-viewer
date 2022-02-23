'use strict';

const assert = require('assert');
const urlJoin = require('url-join');
const { MatrixAuth } = require('matrix-bot-sdk');

const fetchEndpoint = require('../server/lib/fetch-endpoint');

const config = require('../config');
assert(config.testMatrixServerUrl1);
assert(config.testMatrixServerUrl2);

async function getTestClientForHs(testMatrixServerUrl) {
  const auth = new MatrixAuth(testMatrixServerUrl);

  const client = await auth.passwordRegister(
    `user-${Math.floor(Math.random() * 1000000000)}`,
    'password'
  );

  return client;
}

async function createTestRoom(client) {
  const roomId = await client.createRoom({
    preset: 'public_chat',
    name: 'the hangout spot',
  });

  let eventIds = [];
  for (let i = 0; i < 100; i++) {
    const eventId = await client.sendMessage(roomId, {
      msgtype: 'm.text',
      body: `${client.homeserverUrl} - message${i}`,
    });
    eventIds.push(eventId);
  }

  return {
    roomId,
    eventIds,
  };
}

describe('matrix-public-archive', () => {
  it('asdf', async () => {
    const hs1Client = await getTestClientForHs(config.testMatrixServerUrl1);
    const hs2Client = await getTestClientForHs(config.testMatrixServerUrl2);

    const { roomId: hs1RoomId, eventIds: room1EventIds } = await createTestRoom(hs1Client);
    const { roomId: hs2RoomId, eventIds: room2EventIds } = await createTestRoom(hs2Client);

    console.log('hs1RoomId', hs1RoomId, room1EventIds);
    console.log('hs2RoomId', hs2RoomId, room2EventIds);

    try {
      await hs1Client.joinRoom(hs2RoomId, 'hs2');
    } catch (err) {
      throw new Error(
        `Stub error to stop matrix-bot-sdk from logging the response statusCode=${
          err.statusCode
        } body=${JSON.stringify(err.body)}`
      );
    }

    const messagesEndpoint = urlJoin(
      hs1Client.homeserverUrl,
      `_matrix/client/r0/rooms/${hs2RoomId}/messages?limit=5&dir=b`
    );
    const messageResData = await fetchEndpoint(messagesEndpoint, {
      accessToken: hs1Client.accessToken,
    });
    console.log(messageResData);
    console.log(
      messageResData.chunk.map((event) => {
        return `${event.event_id} (${event.type}) - ${event.content.body}`;
      })
    );
  });
});
