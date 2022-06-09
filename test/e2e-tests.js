'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert');
const urlJoin = require('url-join');
const escapeStringRegexp = require('escape-string-regexp');
const { parseHTML } = require('linkedom');

const { fetchEndpointAsText, fetchEndpointAsJson } = require('../server/lib/fetch-endpoint');

const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');

const config = require('../server/lib/config');
const testMatrixServerUrl1 = config.get('testMatrixServerUrl1');
const testMatrixServerUrl2 = config.get('testMatrixServerUrl2');
assert(testMatrixServerUrl1);
assert(testMatrixServerUrl2);
const basePath = config.get('basePath');
assert(basePath);
const interactive = config.get('interactive');

const matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(basePath);

const HOMESERVER_URL_TO_PRETTY_NAME_MAP = {
  [testMatrixServerUrl1]: 'hs1',
  [testMatrixServerUrl2]: 'hs2',
};

let txnCount = 0;
function getTxnId() {
  txnCount++;
  return `${new Date().getTime()}--${txnCount}`;
}

async function getTestClientForHs(testMatrixServerUrl) {
  const registerBody = {
    username: `user-t${new Date().getTime()}-r${Math.floor(Math.random() * 1000000000)}`,
    password: 'password',
  };

  let registerResponse;
  try {
    registerResponse = await fetchEndpointAsJson(
      urlJoin(testMatrixServerUrl, '/_matrix/client/v3/register'),
      {
        method: 'POST',
        body: registerBody,
      }
    );
  } catch (err) {
    // 401 means we need to do user-interactive authentication (UIA), so try and complete a stage
    if (err.response.status === 401) {
      const sessionId = err.session;
      // We just assume this is the flow we can use
      const flow = 'm.login.dummy';

      registerBody['auth'] = {
        type: flow,
        session: sessionId,
      };

      registerResponse = await fetchEndpointAsJson(
        urlJoin(testMatrixServerUrl, '/_matrix/client/v3/register'),
        {
          method: 'POST',
          body: registerBody,
        }
      );
    }
  }

  const accessToken = registerResponse['access_token'];
  if (!accessToken) throw new Error('No access token returned');
  return {
    homeserverUrl: testMatrixServerUrl,
    accessToken,
  };
}

async function sendMessage({ client, roomId, content, timestamp }) {
  assert(client);
  assert(roomId);
  assert(content);

  let qs = '';
  if (timestamp) {
    qs = `?ts=${timestamp}`;
  }

  const sendResponse = await fetchEndpointAsJson(
    urlJoin(
      client.homeserverUrl,
      `/_matrix/client/v3/rooms/${roomId}/send/m.room.message/${getTxnId()}${qs}`
    ),
    {
      method: 'PUT',
      body: content,
      accessToken: client.accessToken,
    }
  );

  return sendResponse['event_id'];
}

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

async function createTestRoom(client) {
  const createRoomResponse = await fetchEndpointAsJson(
    urlJoin(client.homeserverUrl, `/_matrix/client/v3/createRoom`),
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

  return createRoomResponse['room_id'];
}

async function joinRoom({ client, roomId, viaServers }) {
  let qs = '';
  if (viaServers) {
    qs = [].concat(viaServers).reduce((currentQs, viaServer) => {
      return `${currentQs}&server_name=${viaServer}`;
    }, '?');
  }

  const createRoomResponse = await fetchEndpointAsJson(
    urlJoin(client.homeserverUrl, `/_matrix/client/v3/join/${roomId}${qs}`),
    {
      method: 'POST',
      accessToken: client.accessToken,
    }
  );

  return createRoomResponse['room_id'];
}

describe('matrix-public-archive', () => {
  let server;
  before(() => {
    // Start the archive server
    server = require('../server/server');
  });

  after(() => {
    if (!interactive) {
      server.close();
    }
  });

  describe('Test fixture homeservers', () => {
    // Sanity check that our test homeservers can actually federate with each
    // other. The rest of the tests won't work properly if this isn't working.
    it('Test federation between fixture homeservers', async () => {
      const hs1Client = await getTestClientForHs(testMatrixServerUrl1);
      const hs2Client = await getTestClientForHs(testMatrixServerUrl2);

      // Create a room on hs2
      const hs2RoomId = await createTestRoom(hs2Client);
      const room2EventIds = await createMessagesInRoom({
        client: hs2Client,
        roomId: hs2RoomId,
        numMessages: 10,
        prefix: HOMESERVER_URL_TO_PRETTY_NAME_MAP[hs2Client.homeserverUrl],
      });

      // Join hs1 to a room on hs2 (federation)
      await joinRoom({
        client: hs1Client,
        roomId: hs2RoomId,
        viaServers: 'hs2',
      });

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
    });
  });

  describe('Archive', () => {
    // Use a fixed date at the start of the UTC day so that the tests are
    // consistent. Otherwise, the tests could fail when they start close to
    // midnight and it rolls over to the next day.
    const archiveDate = new Date(Date.UTC(2022, 0, 3));
    let archiveUrl;
    let numMessagesSent;
    afterEach(() => {
      if (interactive) {
        console.log('Interactive URL for test', archiveUrl);
      }

      // Reset `numMessagesSent` between tests so each test starts from the
      // beginning of the day and we don't run out of minutes in the day to send
      // messages in (we space messages out by a minute so the timestamp visibly
      // changes in the UI).
      numMessagesSent = 0;
    });

    // Sends a message and makes sure that a timestamp was provided
    async function sendMessageOnArchiveDate(options) {
      const minute = 1000 * 60;
      // Adjust the timestamp by a minute each time so there is some visual difference.
      // FIXME: This currently does not work because the test client is not an application service
      options.timestamp = archiveDate.getTime() + minute * numMessagesSent;
      numMessagesSent++;

      return sendMessage(options);
    }

    it('shows all events in a given day', async () => {
      const client = await getTestClientForHs(testMatrixServerUrl1);
      const roomId = await createTestRoom(client);

      // Just render the page initially so that the archiver user is already
      // joined to the page. We don't want their join event masking the one-off
      // problem where we're missing the latest message in the room. We just use the date now
      // because it will find whatever events backwards no matter when they were sent.
      await fetchEndpointAsText(
        matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, new Date())
      );

      const messageTextList = [
        `Amontons' First Law: The force of friction is directly proportional to the applied load.`,
        `Amontons' Second Law: The force of friction is independent of the apparent area of contact.`,
        // We're aiming for this to be the last message in the room
        `Coulomb's Law of Friction: Kinetic friction is independent of the sliding velocity.`,
      ];

      const eventIds = [];
      for (const messageText of messageTextList) {
        const eventId = await sendMessageOnArchiveDate({
          client,
          roomId,
          content: {
            msgtype: 'm.text',
            body: messageText,
          },
        });
        eventIds.push(eventId);
      }

      // Sanity check that we actually sent some messages
      assert.strictEqual(eventIds.length, 3);

      archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, archiveDate);
      const archivePageHtml = await fetchEndpointAsText(archiveUrl);

      const dom = parseHTML(archivePageHtml);

      // Make sure the messages are visible
      for (let i = 0; i < eventIds.length; i++) {
        const eventId = eventIds[i];
        const eventText = messageTextList[i];
        assert.match(
          dom.document.querySelector(`[data-event-id="${eventId}"]`).outerHTML,
          new RegExp(`.*${escapeStringRegexp(eventText)}.*`)
        );
      }
    });

    // eslint-disable-next-line max-statements
    it('can render diverse messages', async () => {
      const client = await getTestClientForHs(testMatrixServerUrl1);
      const roomId = await createTestRoom(client);

      // TODO: Set avatar of user

      // TODO: Set avatar of room

      // Test image
      const mxcUri = await client.uploadContentFromUrl(
        'https://en.wikipedia.org/wiki/Friction#/media/File:Friction_between_surfaces.jpg'
      );
      const imageEventId = await sendMessageOnArchiveDate({
        client,
        roomId,
        content: {
          body: 'Friction_between_surfaces.jpeg',
          info: {
            size: 396644,
            mimetype: 'image/jpeg',
            thumbnail_info: {
              w: 800,
              h: 390,
              mimetype: 'image/jpeg',
              size: 126496,
            },
            w: 1894,
            h: 925,
            'xyz.amorgan.blurhash': 'LkR3G|IU?w%NbwbIemae_NxuD$M{',
            // TODO: How to get a proper thumnail URL that will load?
            thumbnail_url: mxcUri,
          },
          msgtype: 'm.image',
          url: mxcUri,
        },
      });

      // A normal text message
      const normalMessageText1 =
        '^ Figure 1: Simulated blocks with fractal rough surfaces, exhibiting static frictional interactions';
      const normalMessageEventId1 = await sendMessageOnArchiveDate({
        client,
        roomId,
        content: {
          msgtype: 'm.text',
          body: normalMessageText1,
        },
      });

      // Another normal text message
      const normalMessageText2 =
        'The topography of the Moon has been measured with laser altimetry and stereo image analysis.';
      const normalMessageEventId2 = await sendMessageOnArchiveDate({
        client,
        roomId,
        content: {
          msgtype: 'm.text',
          body: normalMessageText2,
        },
      });

      // Test replies
      const replyMessageText = `The concentration of maria on the near side likely reflects the substantially thicker crust of the highlands of the Far Side, which may have formed in a slow-velocity impact of a second moon of Earth a few tens of millions of years after the Moon's formation.`;
      const replyMessageEventId = await sendMessageOnArchiveDate({
        client,
        roomId,
        content: {
          'org.matrix.msc1767.message': [
            {
              body: '> <@ericgittertester:my.synapse.server> ${normalMessageText2}',
              mimetype: 'text/plain',
            },
            {
              body: `<mx-reply><blockquote><a href="https://matrix.to/#/${roomId}/${normalMessageEventId2}?via=my.synapse.server">In reply to</a> <a href="https://matrix.to/#/@ericgittertester:my.synapse.server">@ericgittertester:my.synapse.server</a><br>${normalMessageText2}</blockquote></mx-reply>${replyMessageText}`,
              mimetype: 'text/html',
            },
          ],
          body: `> <@ericgittertester:my.synapse.server> ${normalMessageText2}\n\n${replyMessageText}`,
          msgtype: 'm.text',
          format: 'org.matrix.custom.html',
          formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/${roomId}/${normalMessageEventId2}?via=my.synapse.server">In reply to</a> <a href="https://matrix.to/#/@ericgittertester:my.synapse.server">@ericgittertester:my.synapse.server</a><br>${normalMessageText2}</blockquote></mx-reply>${replyMessageText}`,
          'm.relates_to': {
            'm.in_reply_to': {
              event_id: normalMessageEventId2,
            },
          },
        },
      });

      // Test reactions
      const reactionText = '😅';
      await client.sendEvent(roomId, 'm.reaction', {
        'm.relates_to': {
          rel_type: 'm.annotation',
          event_id: replyMessageEventId,
          key: reactionText,
        },
      });

      archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, archiveDate);

      const archivePageHtml = await fetchEndpointAsText(archiveUrl);

      const dom = parseHTML(archivePageHtml);

      // Make sure the image message is visible
      const imageElement = dom.document.querySelector(`[data-event-id="${imageEventId}"] img`);
      assert(imageElement);
      assert.match(imageElement.getAttribute('src'), new RegExp(`^http://.*`));
      assert.strictEqual(imageElement.getAttribute('alt'), 'Friction_between_surfaces.jpeg');

      // Make sure the normal message is visible
      assert.match(
        dom.document.querySelector(`[data-event-id="${normalMessageEventId1}"]`).outerHTML,
        new RegExp(`.*${escapeStringRegexp(normalMessageText1)}.*`)
      );

      // Make sure the other normal message is visible
      assert.match(
        dom.document.querySelector(`[data-event-id="${normalMessageEventId2}"]`).outerHTML,
        new RegExp(`.*${escapeStringRegexp(normalMessageText2)}.*`)
      );

      const replyMessageElement = dom.document.querySelector(
        `[data-event-id="${replyMessageEventId}"]`
      );
      // Make sure the reply text is there
      assert.match(
        replyMessageElement.outerHTML,
        new RegExp(`.*${escapeStringRegexp(replyMessageText)}.*`)
      );
      // Make sure it also includes the message we're replying to
      assert.match(
        replyMessageElement.outerHTML,
        new RegExp(`.*${escapeStringRegexp(normalMessageEventId2)}.*`)
      );
      // Make sure the reaction also exists
      assert.match(
        replyMessageElement.outerHTML,
        new RegExp(`.*${escapeStringRegexp(reactionText)}.*`)
      );
    });

    it(`can render day back in time from room on remote homeserver we haven't backfilled from`);

    it(`will redirect to hour pagination when there are too many messages`);

    it(`will render a room with only a day of messages`);

    it(
      `will render a room with a sparse amount of messages (a few per day) with no contamination between days`
    );
  });
});
