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

async function createMessagesInRoom(client, roomId, numMessages, prefix) {
  let eventIds = [];
  for (let i = 0; i < numMessages; i++) {
    const eventId = await client.sendMessage(roomId, {
      msgtype: 'm.text',
      body: `${prefix} - message${i}`,
    });
    eventIds.push(eventId);
  }

  return eventIds;
}

async function createTestRoom(client) {
  const roomId = await client.createRoom({
    preset: 'public_chat',
    name: 'the hangout spot',
  });

  return roomId;
}

describe('matrix-public-archive', () => {
  it('Test federation between fixture homeservers', async () => {
    const hs1Client = await getTestClientForHs(config.testMatrixServerUrl1);
    const hs2Client = await getTestClientForHs(config.testMatrixServerUrl2);

    // Create a room on hs2
    const hs2RoomId = await createTestRoom(hs2Client);
    const room2EventIds = await createMessagesInRoom(
      hs2Client,
      hs2RoomId,
      10,
      hs2Client.homeserverUrl
    );

    // Join hs1 to a room on hs2 (federation)
    await hs1Client.joinRoom(hs2RoomId, 'hs2');

    // From, hs1, make sure we can fetch messages from hs2
    const messagesEndpoint = urlJoin(
      hs1Client.homeserverUrl,
      `_matrix/client/r0/rooms/${hs2RoomId}/messages?limit=5&dir=b&filter={"types":["m.room.message"]}`
    );
    const messageResData = await fetchEndpoint(messagesEndpoint, {
      accessToken: hs1Client.accessToken,
    });

    // Make sure it returned some messages
    assert.strictEqual(messageResData.chunk.length, 5);

    // Make sure all of the messages belong to the room
    messageResData.chunk.map((event) => {
      const isEventInRoomFromHs2 = room2EventIds.some((room2EventId) => {
        return room2EventId === event.event_id;
      });

      // Make sure the message belongs to the room on hs2
      assert.strictEqual(
        isEventInRoomFromHs2,
        true,
        `Expected ${event.event_id} (${event.type}:  "${
          event.content.body
        }") to be in room on hs2=${JSON.stringify(room2EventIds)}`
      );
    });
  });

  it('can render diverse messages');

  it(`can render day back in time from room on remote homeserver we haven't backfilled from`);

  it(`will redirect to hour pagination when there are too many messages`);
});
