'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert');
const urlJoin = require('url-join');
const { MatrixAuth } = require('matrix-bot-sdk');

const server = require('../server/server');
const { fetchEndpointAsText, fetchEndpointAsJson } = require('../server/lib/fetch-endpoint');

const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');

const config = require('../server/lib/config');
const testMatrixServerUrl1 = config.get('testMatrixServerUrl1');
const testMatrixServerUrl2 = config.get('testMatrixServerUrl2');
const basePath = config.get('basePath');
assert(testMatrixServerUrl1);
assert(testMatrixServerUrl2);
assert(basePath);

const matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(basePath);

const HOMESERVER_URL_TO_PRETTY_NAME_MAP = {
  [testMatrixServerUrl1]: 'hs1',
  [testMatrixServerUrl2]: 'hs2',
};

async function getTestClientForHs(testMatrixServerUrl) {
  const auth = new MatrixAuth(testMatrixServerUrl);

  const client = await auth.passwordRegister(
    `user-t${new Date().getTime()}-r${Math.floor(Math.random() * 1000000000)}`,
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
    initial_state: [
      {
        type: 'm.room.history_visibility',
        state_key: '',
        content: {
          history_visibility: 'world_readable',
        },
      },
    ],
  });

  return roomId;
}

describe('matrix-public-archive', () => {
  after(() => {
    //server.close();
  });

  it('Test federation between fixture homeservers', async () => {
    try {
      const hs1Client = await getTestClientForHs(testMatrixServerUrl1);
      const hs2Client = await getTestClientForHs(testMatrixServerUrl2);

      // Create a room on hs2
      const hs2RoomId = await createTestRoom(hs2Client);
      const room2EventIds = await createMessagesInRoom(
        hs2Client,
        hs2RoomId,
        10,
        HOMESERVER_URL_TO_PRETTY_NAME_MAP[hs2Client.homeserverUrl]
      );

      // Join hs1 to a room on hs2 (federation)
      await hs1Client.joinRoom(hs2RoomId, 'hs2');

      // From, hs1, make sure we can fetch messages from hs2
      const messagesEndpoint = urlJoin(
        hs1Client.homeserverUrl,
        `_matrix/client/r0/rooms/${hs2RoomId}/messages?limit=5&dir=b&filter={"types":["m.room.message"]}`
      );
      const messageResData = await fetchEndpointAsJson(messagesEndpoint, {
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
    } catch (err) {
      if (err.body) {
        // FIXME: Remove this try/catch once the matrix-bot-sdk no longer throws
        // huge response objects as errors, see
        // https://github.com/turt2live/matrix-bot-sdk/pull/158
        throw new Error(
          `Error occured in matrix-bot-sdk (this new error is to stop it from logging the huge response) statusCode=${
            err.statusCode
          } body=${JSON.stringify(err.body)}`
        );
      }

      throw err;
    }
  });

  it('can render diverse messages', async () => {
    try {
      const client = await getTestClientForHs(testMatrixServerUrl1);
      const roomId = await createTestRoom(client);

      // TODO: Set avatar of user

      // TODO: Set avatar of room

      // Test image
      const mxcUri = await client.uploadContentFromUrl(
        'https://en.wikipedia.org/wiki/Friction#/media/File:Friction_between_surfaces.jpg'
      );
      await client.sendMessage(roomId, {
        body: 'Friction_between_surfaces.jpeg',
        info: {
          size: 396644,
          mimetype: 'image/jpeg',
          w: 1894,
          h: 925,
          'xyz.amorgan.blurhash': 'LkR3G|IU?w%NbwbIemae_NxuD$M{',
        },
        msgtype: 'm.image',
        url: mxcUri,
      });

      // A normal text message
      await client.sendMessage(roomId, {
        msgtype: 'm.text',
        body: '^ Figure 1: Simulated blocks with fractal rough surfaces, exhibiting static frictional interactions',
      });

      // A normal text message
      await client.sendMessage(roomId, {
        msgtype: 'm.text',
        body: 'The topography of the Moon has been measured with laser altimetry and stereo image analysis.',
      });

      // Test replies
      const eventToReplyTo = await client.sendMessage(roomId, {
        'org.matrix.msc1767.message': [
          {
            body: "> <@ericgittertester:my.synapse.server> The topography of the Moon has been measured with laser altimetry and stereo image analysis.\n\nThe concentration of maria on the near side likely reflects the substantially thicker crust of the highlands of the Far Side, which may have formed in a slow-velocity impact of a second moon of Earth a few tens of millions of years after the Moon's formation.",
            mimetype: 'text/plain',
          },
          {
            body: '<mx-reply><blockquote><a href="https://matrix.to/#/!HBehERstyQBxyJDLfR:my.synapse.server/$uEeScM2gfILkLpG8sOBTK7vcS0w_t3a9EVIAnSwqyiY?via=my.synapse.server">In reply to</a> <a href="https://matrix.to/#/@ericgittertester:my.synapse.server">@ericgittertester:my.synapse.server</a><br>The topography of the Moon has been measured with laser altimetry and stereo image analysis.</blockquote></mx-reply>The concentration of maria on the near side likely reflects the substantially thicker crust of the highlands of the Far Side, which may have formed in a slow-velocity impact of a second moon of Earth a few tens of millions of years after the Moon\'s formation.',
            mimetype: 'text/html',
          },
        ],
        body: "> <@ericgittertester:my.synapse.server> The topography of the Moon has been measured with laser altimetry and stereo image analysis.\n\nThe concentration of maria on the near side likely reflects the substantially thicker crust of the highlands of the Far Side, which may have formed in a slow-velocity impact of a second moon of Earth a few tens of millions of years after the Moon's formation.",
        msgtype: 'm.text',
        format: 'org.matrix.custom.html',
        formatted_body:
          '<mx-reply><blockquote><a href="https://matrix.to/#/!HBehERstyQBxyJDLfR:my.synapse.server/$uEeScM2gfILkLpG8sOBTK7vcS0w_t3a9EVIAnSwqyiY?via=my.synapse.server">In reply to</a> <a href="https://matrix.to/#/@ericgittertester:my.synapse.server">@ericgittertester:my.synapse.server</a><br>The topography of the Moon has been measured with laser altimetry and stereo image analysis.</blockquote></mx-reply>The concentration of maria on the near side likely reflects the substantially thicker crust of the highlands of the Far Side, which may have formed in a slow-velocity impact of a second moon of Earth a few tens of millions of years after the Moon\'s formation.',
        'm.relates_to': {
          'm.in_reply_to': {
            event_id: '$uEeScM2gfILkLpG8sOBTK7vcS0w_t3a9EVIAnSwqyiY',
          },
        },
      });

      // Test reactions
      await client.sendEvent(roomId, 'm.reaction', {
        'm.relates_to': {
          rel_type: 'm.annotation',
          event_id: eventToReplyTo,
          key: '��',
        },
      });

      const archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, new Date());

      const archivePageHtml = await fetchEndpointAsText(archiveUrl);
      console.log('archivePageHtml', archivePageHtml);
    } catch (err) {
      if (err.body) {
        // FIXME: Remove this try/catch once the matrix-bot-sdk no longer throws
        // huge response objects as errors, see
        // https://github.com/turt2live/matrix-bot-sdk/pull/158
        throw new Error(
          `Error occured in matrix-bot-sdk (this new error is to stop it from logging the huge response) statusCode=${
            err.statusCode
          } body=${JSON.stringify(err.body)}`
        );
      }

      throw err;
    }
  });

  it(`can render day back in time from room on remote homeserver we haven't backfilled from`);

  it(`will redirect to hour pagination when there are too many messages`);
});
