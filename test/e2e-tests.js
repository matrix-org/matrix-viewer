'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert');
const path = require('path');
const http = require('http');
const urlJoin = require('url-join');
const escapeStringRegexp = require('escape-string-regexp');
const { parseHTML } = require('linkedom');
const { readFile } = require('fs').promises;
const chalk = require('chalk');

const RethrownError = require('../server/lib/errors/rethrown-error');
const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');
const { fetchEndpointAsText, fetchEndpointAsJson } = require('../server/lib/fetch-endpoint');
const ensureRoomJoined = require('../server/lib/matrix-utils/ensure-room-joined');
const config = require('../server/lib/config');
const {
  MS_LOOKUP,
  TIME_PRECISION_VALUES,
  DIRECTION,
} = require('matrix-public-archive-shared/lib/reference-values');
const { ONE_DAY_IN_MS, ONE_HOUR_IN_MS, ONE_MINUTE_IN_MS, ONE_SECOND_IN_MS } = MS_LOOKUP;
const {
  roundUpTimestampToUtcDay,
  getUtcStartOfDayTs,
} = require('matrix-public-archive-shared/lib/timestamp-utilities');

const {
  getTestClientForAs,
  getTestClientForHs,
  createTestRoom,
  upgradeTestRoom,
  getCanonicalAlias,
  joinRoom,
  sendEvent,
  sendMessage,
  createMessagesInRoom,
  getMessagesInRoom,
  waitForResultsInHomeserverRoomDirectory,
  updateProfile,
  uploadContent,
} = require('./test-utils/client-utils');
const TestError = require('./test-utils/test-error');
const parseRoomDayMessageStructure = require('./test-utils/parse-room-day-message-structure');
const parseArchiveUrlForRoom = require('./test-utils/parse-archive-url-for-room');

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
function assertExpectedTimePrecisionAgainstUrl(expectedTimePrecision, url) {
  const urlObj = new URL(url, basePath);
  const urlPathname = urlObj.pathname;

  // First check the URL has the appropriate time precision
  if (expectedTimePrecision === null) {
    assert.doesNotMatch(
      urlPathname,
      /T[\d:]*?$/,
      `Expected the URL to *not* have any time precision but saw ${urlPathname}`
    );
  } else if (expectedTimePrecision === TIME_PRECISION_VALUES.minutes) {
    assert.match(urlPathname, /T\d\d:\d\d$/);
  } else if (expectedTimePrecision === TIME_PRECISION_VALUES.seconds) {
    assert.match(urlPathname, /T\d\d:\d\d:\d\d$/);
  } else {
    throw new Error(
      `\`expectedTimePrecision\` was an unexpected value ${expectedTimePrecision} which we don't know how to assert here`
    );
  }
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
      const { eventIds: room2EventIds } = await createMessagesInRoom({
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
      const { data: messageResData } = await fetchEndpointAsJson(messagesEndpoint, {
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
          }") to be in room on hs2=${JSON.stringify(room2EventIds, null, 2)}`
        );
      });
    });
  });

  describe('Archive', () => {
    // Use a fixed date at the start of the UTC day so that the tests are
    // consistent. Otherwise, the tests could fail when they start close to
    // midnight and it rolls over to the next day.
    // January 15th, 2022
    const archiveDate = new Date(Date.UTC(2022, 0, 15));
    let archiveUrl;
    let numMessagesSent = 0;
    afterEach(function () {
      if (interactive) {
        // eslint-disable-next-line no-console
        console.log('Interactive URL for test', archiveUrl);
      }

      // Reset `numMessagesSent` between tests so each test starts from the
      // beginning of the day and we don't run out of minutes in the day to send
      // messages in (we space messages out by a minute so the timestamp visibly
      // changes in the UI).
      numMessagesSent = 0;

      // Reset any custom modifications made for a particular test.
      //
      // We don't reset when interactive and there is a failure because we want to be
      // able to preview the interactive URL with the same config as seen in the test
      // and because we also set `--bail` when running `npm run test-e2e-interactive`,
      // the tests stop running after the first failure so it doesn't leak state between
      // tests.
      if (!interactive && this.currentTest.state !== 'passed') {
        config.reset();
      }
    });

    // Sends a message and makes sure that a timestamp was provided
    async function sendMessageOnArchiveDate(options) {
      const minute = 1000 * 60;
      // Adjust the timestamp by a minute each time so there is some visual difference.
      options.timestamp = archiveDate.getTime() + minute * numMessagesSent;
      numMessagesSent++;

      return sendMessage(options);
    }

    // Sends a message and makes sure that a timestamp was provided
    async function sendEventOnArchiveDate(options) {
      const minute = 1000 * 60;
      // Adjust the timestamp by a minute each time so there is some visual difference.
      options.timestamp = archiveDate.getTime() + minute * numMessagesSent;
      numMessagesSent++;

      return sendEvent(options);
    }

    describe('Archive room view', () => {
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

        // TODO: Can we use `createMessagesInRoom` here instead?
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
        const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);

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

        const userAvatarBuffer = Buffer.from(
          // Purple PNG pixel
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPsD9j0HwAFmQKScbjOAwAAAABJRU5ErkJggg==',
          'base64'
        );
        const userAvatarMxcUri = await uploadContent({
          client,
          roomId,
          data: userAvatarBuffer,
          fileName: 'client user avatar',
        });
        const displayName = `${client.userId}-some-display-name`;
        await updateProfile({
          client,
          displayName,
          avatarUrl: userAvatarMxcUri,
        });

        // TODO: Set avatar of room

        // Test image
        // via https://en.wikipedia.org/wiki/Friction#/media/File:Friction_between_surfaces.jpg (CaoHao)
        const imageBuffer = await readFile(
          path.resolve(__dirname, './fixtures/friction_between_surfaces.jpg')
        );
        const imageFileName = 'friction_between_surfaces.jpg';
        const mxcUri = await uploadContent({
          client,
          roomId,
          data: imageBuffer,
          fileName: imageFileName,
        });
        const imageEventId = await sendMessageOnArchiveDate({
          client,
          roomId,
          content: {
            body: imageFileName,
            info: {
              size: 17471,
              mimetype: 'image/jpeg',
              w: 640,
              h: 312,
              'xyz.amorgan.blurhash': 'LkR3G|IU?w%NbxbIemae_NxuD$M{',
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

        // Test to make sure we can render the page when the reply is missing the
        // event it's replying to (the relation).
        const replyMissingRelationMessageText = `While the giant-impact theory explains many lines of evidence, some questions are still unresolved, most of which involve the Moon's composition.`;
        const missingRelationEventId = '$someMissingEvent';
        const replyMissingRelationMessageEventId = await sendMessageOnArchiveDate({
          client,
          roomId,
          content: {
            'org.matrix.msc1767.message': [
              {
                body: '> <@ericgittertester:my.synapse.server> some missing message',
                mimetype: 'text/plain',
              },
              {
                body: `<mx-reply><blockquote><a href="https://matrix.to/#/${roomId}/${missingRelationEventId}?via=my.synapse.server">In reply to</a> <a href="https://matrix.to/#/@ericgittertester:my.synapse.server">@ericgittertester:my.synapse.server</a><br>some missing message</blockquote></mx-reply>${replyMissingRelationMessageText}`,
                mimetype: 'text/html',
              },
            ],
            body: `> <@ericgittertester:my.synapse.server> some missing message\n\n${replyMissingRelationMessageText}`,
            msgtype: 'm.text',
            format: 'org.matrix.custom.html',
            formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/${roomId}/${missingRelationEventId}?via=my.synapse.server">In reply to</a> <a href="https://matrix.to/#/@ericgittertester:my.synapse.server">@ericgittertester:my.synapse.server</a><br>some missing message</blockquote></mx-reply>${replyMissingRelationMessageText}`,
            'm.relates_to': {
              'm.in_reply_to': {
                event_id: missingRelationEventId,
              },
            },
          },
        });

        // Test reactions
        const reactionText = '😅';
        await sendEventOnArchiveDate({
          client,
          roomId,
          eventType: 'm.reaction',
          content: {
            'm.relates_to': {
              rel_type: 'm.annotation',
              event_id: replyMessageEventId,
              key: reactionText,
            },
          },
        });

        archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, archiveDate);

        const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);

        const dom = parseHTML(archivePageHtml);

        // Make sure the user display name is visible on the message
        assert.match(
          dom.document.querySelector(`[data-event-id="${imageEventId}"]`).outerHTML,
          new RegExp(`.*${escapeStringRegexp(displayName)}.*`)
        );

        // Make sure the user avatar is visible on the message
        const avatarImageElement = dom.document.querySelector(
          `[data-event-id="${imageEventId}"] [data-testid="avatar"] img`
        );
        assert(avatarImageElement);
        assert.match(avatarImageElement.getAttribute('src'), new RegExp(`^http://.*`));

        // Make sure the image message is visible
        const imageElement = dom.document.querySelector(
          `[data-event-id="${imageEventId}"] [data-testid="media"] img`
        );
        assert(imageElement);
        assert.match(imageElement.getAttribute('src'), new RegExp(`^http://.*`));
        assert.strictEqual(imageElement.getAttribute('alt'), imageFileName);

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

        const replyMissingRelationMessageElement = dom.document.querySelector(
          `[data-event-id="${replyMissingRelationMessageEventId}"]`
        );
        // Make sure the reply text is there.
        // We don't care about the message we're replying to because it's missing on purpose.
        assert.match(
          replyMissingRelationMessageElement.outerHTML,
          new RegExp(`.*${escapeStringRegexp(replyMissingRelationMessageText)}.*`)
        );

        // Make sure the reaction also exists
        assert.match(
          replyMessageElement.outerHTML,
          new RegExp(`.*${escapeStringRegexp(reactionText)}.*`)
        );
      });

      it(`can render day back in time from room on remote homeserver we haven't backfilled from`, async () => {
        const hs2Client = await getTestClientForHs(testMatrixServerUrl2);

        // Create a room on hs2
        const hs2RoomId = await createTestRoom(hs2Client);
        const { eventIds: room2EventIds } = await createMessagesInRoom({
          client: hs2Client,
          roomId: hs2RoomId,
          numMessages: 3,
          prefix: HOMESERVER_URL_TO_PRETTY_NAME_MAP[hs2Client.homeserverUrl],
          timestamp: archiveDate.getTime(),
        });

        archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(hs2RoomId, archiveDate, {
          // Since hs1 doesn't know about this room on hs2 yet, we have to provide
          // a via server to ask through.
          viaServers: [HOMESERVER_URL_TO_PRETTY_NAME_MAP[testMatrixServerUrl2]],
        });

        const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);

        const dom = parseHTML(archivePageHtml);

        // Make sure the messages are visible
        assert.deepStrictEqual(
          room2EventIds.map((eventId) => {
            return dom.document
              .querySelector(`[data-event-id="${eventId}"]`)
              ?.getAttribute('data-event-id');
          }),
          room2EventIds
        );
      });

      it('redirects to most recent day with message history', async () => {
        const client = await getTestClientForHs(testMatrixServerUrl1);
        const roomId = await createTestRoom(client);

        // Send an event in the room so we have some day of history to redirect to
        const eventId = await sendMessageOnArchiveDate({
          client,
          roomId,
          content: {
            msgtype: 'm.text',
            body: 'some message in the history',
          },
        });
        const expectedEventIdsOnDay = [eventId];

        // Visit `/:roomIdOrAlias` and expect to be redirected to the most recent day with events
        archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForRoom(roomId);
        const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);

        const dom = parseHTML(archivePageHtml);

        // Make sure the messages from the day we expect to get redirected to are visible
        assert.deepStrictEqual(
          expectedEventIdsOnDay.map((eventId) => {
            return dom.document
              .querySelector(`[data-event-id="${eventId}"]`)
              ?.getAttribute('data-event-id');
          }),
          expectedEventIdsOnDay
        );
      });

      it('still shows surrounding messages on a day with no messages', async () => {
        const client = await getTestClientForHs(testMatrixServerUrl1);
        const roomId = await createTestRoom(client);

        // Send an event in the room so there is some history to display in the
        // surroundings and everything doesn't just 404 because we can't find
        // any event.
        const eventId = await sendMessageOnArchiveDate({
          client,
          roomId,
          content: {
            msgtype: 'm.text',
            body: 'some message in the history',
          },
        });
        const expectedEventIdsToBeDisplayed = [eventId];

        // Visit the archive on the day ahead of where there are messages
        const visitArchiveDate = new Date(Date.UTC(2022, 0, 20));
        assert(
          visitArchiveDate > archiveDate,
          'The date we visit the archive (`visitArchiveDate`) should be after where the messages were sent (`archiveDate`)'
        );
        archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, visitArchiveDate);
        const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);

        const dom = parseHTML(archivePageHtml);

        // Make sure the summary exists on the page
        assert(
          dom.document.querySelector(
            `[data-testid="not-enough-events-summary-kind-no-events-in-day"]`
          )
        );

        // Make sure the messages there are some messages from the surrounding days
        assert.deepStrictEqual(
          expectedEventIdsToBeDisplayed.map((eventId) => {
            return dom.document
              .querySelector(`[data-event-id="${eventId}"]`)
              ?.getAttribute('data-event-id');
          }),
          expectedEventIdsToBeDisplayed
        );
      });

      it('shows no events summary when no messages at or before the given day (empty view)', async () => {
        const client = await getTestClientForHs(testMatrixServerUrl1);
        const roomId = await createTestRoom(client);

        // We purposely send no events in the room

        archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, archiveDate);
        const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);

        const dom = parseHTML(archivePageHtml);

        // Make sure the summary exists on the page
        assert(
          dom.document.querySelector(
            `[data-testid="not-enough-events-summary-kind-no-events-at-all"]`
          )
        );
      });

      it('404 when trying to view a future day', async () => {
        const client = await getTestClientForHs(testMatrixServerUrl1);
        const roomId = await createTestRoom(client);

        try {
          const TWO_DAYS_IN_MS = 2 * ONE_DAY_IN_MS;
          await fetchEndpointAsText(
            matrixPublicArchiveURLCreator.archiveUrlForDate(
              roomId,
              new Date(Date.now() + TWO_DAYS_IN_MS)
            )
          );
          assert.fail(
            new TestError(
              `We expect the request to fail with a 404 since you can't view the future in the archive but it succeeded`
            )
          );
        } catch (err) {
          if (err instanceof TestError) {
            throw err;
          }

          assert.strictEqual(
            err?.response?.status,
            404,
            `Expected err.response.status=${err?.response?.status} to be 404 but error was: ${err.stack}`
          );
        }
      });

      describe('safe search', () => {
        [
          {
            testName: 'nsfw words in title',
            createRoomOptions: {
              name: `uranus-nsfw`,
            },
          },
          {
            testName: 'nsfw words in topic',
            createRoomOptions: {
              name: `mars`,
              topic: 'Get your ass to mars (NSFW)',
            },
          },
        ].forEach((testCase) => {
          it(`${testCase.testName} is correctly blocked/marked by safe search`, async () => {
            const client = await getTestClientForHs(testMatrixServerUrl1);
            const roomId = await createTestRoom(client, testCase.createRoomOptions);

            archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, archiveDate);
            const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);
            const dom = parseHTML(archivePageHtml);

            // Make sure the `<meta name="rating" ...>` tag exists on the page
            // telling search engines that this is an adult page.
            const metaElements = Array.from(dom.document.querySelectorAll('meta'));
            assert.strictEqual(
              dom.document.querySelector(`meta[name="rating"]`)?.getAttribute('content'),
              'adult',
              `Unable to find <meta name="rating" content="adult"> on the page. We found these meta elements though:${metaElements
                // eslint-disable-next-line max-nested-callbacks
                .map((metaElement) => `\n    \`${metaElement.outerHTML}\``)
                .join('')}`
            );
          });
        });

        it('normal room is not blocked/marked by safe search', async () => {
          const client = await getTestClientForHs(testMatrixServerUrl1);
          const roomId = await createTestRoom(client);

          archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, archiveDate);
          const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);
          const dom = parseHTML(archivePageHtml);

          // Make sure the `<meta name="rating" ...>` tag does NOT exist on the
          // page telling search engines that this is an adult page.
          assert.strictEqual(dom.document.querySelector(`meta[name="rating"]`), null);
        });
      });

      describe('time selector', () => {
        it('shows time selector when there are too many messages from the same day', async () => {
          // Set this low so it's easy to hit the limit
          config.set('archiveMessageLimit', 3);

          const client = await getTestClientForHs(testMatrixServerUrl1);
          const roomId = await createTestRoom(client);

          await createMessagesInRoom({
            client,
            roomId,
            // This should be greater than the `archiveMessageLimit`
            numMessages: 10,
            prefix: `foo`,
            timestamp: archiveDate.getTime(),
            // Just spread things out a bit so the event times are more obvious
            // and stand out from each other while debugging
            increment: ONE_HOUR_IN_MS,
          });

          archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, archiveDate);
          const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);
          const dom = parseHTML(archivePageHtml);

          // Make sure the time selector is visible
          const timeSelectorElement = dom.document.querySelector(`[data-testid="time-selector"]`);
          assert(timeSelectorElement);
        });

        it('shows time selector when there are too many messages from the same day but paginated forward into days with no messages', async () => {
          // Set this low so it's easy to hit the limit
          config.set('archiveMessageLimit', 3);

          const client = await getTestClientForHs(testMatrixServerUrl1);
          const roomId = await createTestRoom(client);

          await createMessagesInRoom({
            client,
            roomId,
            // This should be greater than the `archiveMessageLimit`
            numMessages: 10,
            prefix: `foo`,
            timestamp: archiveDate.getTime(),
            // Just spread things out a bit so the event times are more obvious
            // and stand out from each other while debugging
            increment: ONE_HOUR_IN_MS,
          });

          // Visit a day after when the messages were sent but there weren't
          const visitArchiveDate = new Date(Date.UTC(2022, 0, 20));
          assert(
            visitArchiveDate > archiveDate,
            'The date we visit the archive (`visitArchiveDate`) should be after where the messages were sent (`archiveDate`)'
          );
          archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, visitArchiveDate);
          const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);
          const dom = parseHTML(archivePageHtml);

          // Make sure the time selector is visible
          const timeSelectorElement = dom.document.querySelector(`[data-testid="time-selector"]`);
          assert(timeSelectorElement);
        });

        it('does not show time selector when all events from the same day but not over the limit', async () => {
          // Set this low so we don't have to deal with many messages in the tests But
          // high enough to encompass all of the primoridial room creation events +
          // whatever messages we send in the room for this test.
          config.set('archiveMessageLimit', 15);

          const client = await getTestClientForHs(testMatrixServerUrl1);
          // FIXME: This test is flawed and needs MSC3997 to timestamp massage the
          // `/createRoom` events otherwise the `areTimestampsFromSameUtcDay(...)` will
          // always be false because the create room events are from today vs the
          // timestamp massaged messages we send below.
          const roomId = await createTestRoom(client);

          await createMessagesInRoom({
            client,
            roomId,
            // This should be lesser than the `archiveMessageLimit`
            numMessages: 1,
            prefix: `foo`,
            timestamp: archiveDate.getTime(),
            // Just spread things out a bit so the event times are more obvious
            // and stand out from each other while debugging
            increment: ONE_HOUR_IN_MS,
          });

          archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, archiveDate);
          const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);
          const dom = parseHTML(archivePageHtml);

          // Make sure the time selector is *NOT* visible
          const timeSelectorElement = dom.document.querySelector(`[data-testid="time-selector"]`);
          assert.strictEqual(timeSelectorElement, null);
        });

        it('does not show time selector when showing events from multiple days', async () => {
          // Set this low so we don't have to deal with many messages in the tests
          config.set('archiveMessageLimit', 5);

          const client = await getTestClientForHs(testMatrixServerUrl1);
          const roomId = await createTestRoom(client);

          // Create more messages than the archiveMessageLimit across many days but we
          // should not go over the limit on a daily basis
          const dayBeforeArchiveDateTs = Date.UTC(
            archiveDate.getUTCFullYear(),
            archiveDate.getUTCMonth(),
            archiveDate.getUTCDate() - 1
          );
          await createMessagesInRoom({
            client,
            roomId,
            // This should be lesser than the `archiveMessageLimit`
            numMessages: 3,
            prefix: `foo`,
            timestamp: dayBeforeArchiveDateTs,
            // Just spread things out a bit so the event times are more obvious
            // and stand out from each other while debugging
            increment: ONE_HOUR_IN_MS,
          });
          await createMessagesInRoom({
            client,
            roomId,
            // This should be lesser than the `archiveMessageLimit`
            numMessages: 3,
            prefix: `foo`,
            timestamp: archiveDate.getTime(),
            // Just spread things out a bit so the event times are more obvious
            // and stand out from each other while debugging
            increment: ONE_HOUR_IN_MS,
          });

          archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, archiveDate);
          const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);
          const dom = parseHTML(archivePageHtml);

          // Make sure the time selector is *NOT* visible
          const timeSelectorElement = dom.document.querySelector(`[data-testid="time-selector"]`);
          assert.strictEqual(timeSelectorElement, null);
        });
      });

      describe('Jump forwards and backwards', () => {
        function runJumpTestCase(testCase) {
          // eslint-disable-next-line max-statements, complexity
          it(testCase.testName, async () => {
            // Setup
            // --------------------------------------
            // --------------------------------------
            const eventMap = new Map();
            const fancyIdentifierToEventIdMap = new Map();
            const eventIdToFancyIdentifierMap = new Map();
            const fancyIdentifierToRoomIdMap = new Map();
            const roomIdToFancyIdentifierMap = new Map();
            const fancyRoomIdToDebugEventsInRoom = new Map();

            // String used to log out all possible events in the room
            function getDebugStringForEventsInRoomsAndLookForEventId(eventIdToLookFor) {
              return `For reference, here are all of the events in the rooms: ${JSON.stringify(
                Object.fromEntries(
                  Array.from(fancyRoomIdToDebugEventsInRoom.entries()).map((entry) => {
                    const fancyRoomId = entry[0];
                    const newKey = `${fancyRoomId} - ${fancyIdentifierToRoomIdMap.get(
                      fancyRoomId
                    )}`;
                    return [newKey, entry[1]];
                  })
                ),
                null,
                2
              )
                .split(/\r?\n/)
                .map((line) => {
                  if (eventIdToLookFor && line.includes(eventIdToLookFor)) {
                    return chalk.yellow(line);
                  }

                  return line;
                })
                .join('\n')}`;
            }

            function convertFancyIdentifierListToDebugEventIds(fancyEventIdentifiers) {
              // eslint-disable-next-line max-nested-callbacks
              return fancyEventIdentifiers.map((fancyId) => {
                const eventId = fancyIdentifierToEventIdMap.get(fancyId);
                if (!eventId) {
                  throw new Error(
                    `Could not find fancy ID ${fancyId} in the fancyIdentifierToEventMap=${JSON.stringify(
                      Object.fromEntries(fancyIdentifierToEventIdMap.entries()),
                      null,
                      2
                    )}`
                  );
                }
                const ts = eventMap.get(eventId)?.originServerTs;
                const tsDebugString = ts && `${new Date(ts).toISOString()} (${ts})`;
                return `${eventId} (${fancyId}) - ${tsDebugString}`;
              });
            }

            function convertEventIdsToDebugEventIds(eventIds) {
              // eslint-disable-next-line max-nested-callbacks
              return eventIds.map((eventId) => {
                const fancyEventId = eventIdToFancyIdentifierMap.get(eventId);
                if (!fancyEventId) {
                  throw new Error(
                    `Could not find event ID for ${eventId} in the eventIdToFancyIdentifierMap=${JSON.stringify(
                      Object.fromEntries(eventIdToFancyIdentifierMap.entries()),
                      null,
                      2
                    )}\n${getDebugStringForEventsInRoomsAndLookForEventId(eventId)}`
                  );
                }
                const ts = eventMap.get(eventId)?.originServerTs;
                const tsDebugString = ts && `${new Date(ts).toISOString()} (${ts})`;
                return `${eventId} (${fancyEventId}) - ${tsDebugString}`;
              });
            }

            function convertUrlBetween(inputUrl, roomMap, eventMap) {
              const {
                roomIdOrAliasUrlPart: inputRoomIdOrAliasUrlPart,
                roomIdOrAlias: inputRoomIdOrAlias,
                //urlDateTime: actualUrlDateTime,
                continueAtEvent: inputContinueAtEventId,
              } = parseArchiveUrlForRoom(inputUrl);

              let outputContinueAtEventId;
              if (inputContinueAtEventId) {
                outputContinueAtEventId = eventMap.get(inputContinueAtEventId);
                assert(
                  outputContinueAtEventId,
                  `Could not find event ID for ${inputContinueAtEventId} in the map=${JSON.stringify(
                    Object.fromEntries(eventMap.entries()),
                    null,
                    2
                  )}\n${getDebugStringForEventsInRoomsAndLookForEventId(inputContinueAtEventId)}`
                );
              }

              const outputRoomIdOrAlias = roomMap.get(inputRoomIdOrAlias);
              assert(
                outputRoomIdOrAlias,
                `Could not find room ID for ${inputRoomIdOrAlias} in our map ${JSON.stringify(
                  Object.fromEntries(roomMap.entries()),
                  null,
                  2
                )}`
              );

              return inputUrl
                .replace(
                  `/roomid/${inputRoomIdOrAliasUrlPart}`,
                  // Slice to remove the sigil
                  `/roomid/${outputRoomIdOrAlias.slice(1)}`
                )
                .replace(inputContinueAtEventId, outputContinueAtEventId);
            }

            function convertUrlWithFancyIdsToActualUrl(urlWithFancyIds) {
              return convertUrlBetween(
                urlWithFancyIds,
                fancyIdentifierToRoomIdMap,
                fancyIdentifierToEventIdMap
              );
            }

            function convertActualUrlToUrlWithFancyIds(urlWithFancyIds) {
              return convertUrlBetween(
                urlWithFancyIds,
                roomIdToFancyIdentifierMap,
                eventIdToFancyIdentifierMap
              );
            }

            const client = await getTestClientForHs(testMatrixServerUrl1);

            const { rooms, pages } = parseRoomDayMessageStructure(
              testCase.roomDayMessageStructureString
            );
            let previousRoomId;
            let lastEventTsUsedInPreviousRoom;
            for (const [roomIndex, room] of rooms.entries()) {
              let roomId;
              if (previousRoomId) {
                const { newRoomid, tombstoneEventId } = await upgradeTestRoom({
                  client,
                  oldRoomId: previousRoomId,
                  //useMsc3946DynamicPredecessor: TODO: Enable this when we have a way to configure it.
                  // We `+ 1` just to space out the tombstone from the last event so
                  // things are sequential `/timestamp_to_event` doesn't get confused.
                  timestamp: lastEventTsUsedInPreviousRoom + 1,
                });
                roomId = newRoomid;

                const fancyEventId = `$tombstone`;
                fancyIdentifierToEventIdMap.set(fancyEventId, tombstoneEventId);
                eventIdToFancyIdentifierMap.set(tombstoneEventId, fancyEventId);
              } else {
                // TODO: Pass `timestamp` massaging option to `createTestRoom()` when it
                // supports it, see https://github.com/matrix-org/matrix-public-archive/issues/169
                roomId = await createTestRoom(client);
              }
              const fancyRoomId = `!room${roomIndex + 1}`;
              fancyIdentifierToRoomIdMap.set(fancyRoomId, roomId);
              roomIdToFancyIdentifierMap.set(roomId, fancyRoomId);

              // Join the archive user to the room before we create the test messages to
              // avoid problems jumping to the latest activity since we can't control the
              // timestamp of the membership event.
              const archiveAppServiceUserClient = await getTestClientForAs();
              // We use `ensureRoomJoined` instead of `joinRoom` because we're joining
              // the archive user here and want the same join `reason` to avoid a new
              // state event being created (`joinRoom` -> `{ displayname, membership }`
              // whereas `ensureRoomJoined` -> `{ reason, displayname, membership }`)
              await ensureRoomJoined(archiveAppServiceUserClient.accessToken, roomId);

              // Just spread things out a bit so the event times are more obvious
              // and stand out from each other while debugging and so we just have
              // to deal with hour time slicing
              const eventSendTimeIncrement =
                testCase.timeIncrementBetweenMessages || ONE_HOUR_IN_MS;

              for (const eventMeta of room.events) {
                const archiveDate = new Date(Date.UTC(2022, 0, eventMeta.dayNumber, 0, 0, 0, 1));
                const originServerTs =
                  archiveDate.getTime() + eventMeta.eventIndexInDay * eventSendTimeIncrement;
                const content = {
                  msgtype: 'm.text',
                  body: `event${eventMeta.eventNumber} - day${eventMeta.dayNumber}.${eventMeta.eventIndexInDay}`,
                };
                const eventId = await sendMessage({
                  client,
                  roomId,
                  content,
                  // Technically, we don't have to set the timestamp to be unique or sequential but
                  // it still seems like a good idea to make the tests more clear.
                  timestamp: originServerTs,
                });
                eventMap.set(eventId, {
                  type: 'm.room.message',
                  roomId,
                  originServerTs,
                  content,
                });
                const fancyEventId = `$event${eventMeta.eventNumber}`;
                fancyIdentifierToEventIdMap.set(fancyEventId, eventId);
                eventIdToFancyIdentifierMap.set(eventId, fancyEventId);
                lastEventTsUsedInPreviousRoom = originServerTs;
              }

              previousRoomId = roomId;
            }

            // Assemble a list of events to to reference and assist with debugging when
            // some assertion fails
            for (const [fancyRoomId, roomId] of fancyIdentifierToRoomIdMap.entries()) {
              const archiveAppServiceUserClient = await getTestClientForAs();
              const eventsInRoom = await getMessagesInRoom({
                client: archiveAppServiceUserClient,
                roomId: roomId,
                // This is arbitrarily larger than any amount of messages we would ever
                // send in the tests
                limit: 1000,
              });
              const eventDebugStrings = eventsInRoom.map((event) => {
                let relevantContentString = '';
                if (event.type === 'm.room.message' && event.content.msgtype === 'm.text') {
                  relevantContentString = ` "${event.content.body}"`;
                } else if (event.type === 'm.room.create') {
                  const predecessorRoomId = event.content?.predecessor?.room_id;
                  if (predecessorRoomId) {
                    relevantContentString = ` "predecessor=${predecessorRoomId}"`;
                  }
                } else if (event.type === 'm.room.tombstone') {
                  const replacementRoomId = event.content?.replacement_room;
                  if (replacementRoomId) {
                    relevantContentString = ` "successor=${replacementRoomId}"`;
                  }
                }

                return `${event.type}${event.state_key ? ` (${event.state_key})` : ''}: ${
                  event.event_id
                }${relevantContentString} - ${new Date(event.origin_server_ts).toISOString()}`;
              });

              fancyRoomIdToDebugEventsInRoom.set(fancyRoomId, eventDebugStrings);
            }

            // Now Test
            // --------------------------------------
            // --------------------------------------

            // Make sure the archive is configured as the test expects
            assert(testCase.archiveMessageLimit);
            config.set('archiveMessageLimit', testCase.archiveMessageLimit);

            // eslint-disable-next-line max-nested-callbacks
            const pagesKeyList = Object.keys(testCase).filter((key) => {
              const isPageKey = key.startsWith('page');
              if (isPageKey) {
                assert.match(key, /page\d+/);
                return true;
              }

              return false;
            });
            assert(
              pagesKeyList.length > 0,
              'You must have at least one `pageX` of expectations in your jump test case'
            );
            // Make sure the page are in order
            // eslint-disable-next-line max-nested-callbacks
            pagesKeyList.reduce((prevPageCount, currentPageKey) => {
              const pageNumber = parseInt(currentPageKey.match(/\d+$/)[0], 10);
              assert(
                prevPageCount + 1 === pageNumber,
                `Page numbers must be sorted in each test case but found ` +
                  `${pageNumber} after ${prevPageCount} - pagesList=${pagesKeyList}`
              );
              return pageNumber;
            }, 0);

            // Get the URL for the first page to fetch
            //
            // Set the `archiveUrl` for debugging if the test fails here
            const { roomIdOrAlias: startRoomFancyKey, urlDateTime: startUrlDateTime } =
              parseArchiveUrlForRoom(urlJoin('https://example.com', testCase.startUrl));
            const startRoomIdOrAlias = fancyIdentifierToRoomIdMap.get(startRoomFancyKey);
            assert(
              startRoomIdOrAlias,
              `Could not find room ID for ${startRoomFancyKey} in our list of known rooms ${JSON.stringify(
                Object.fromEntries(fancyIdentifierToRoomIdMap.entries()),
                null,
                2
              )}`
            );
            archiveUrl = `${matrixPublicArchiveURLCreator.archiveUrlForRoom(
              startRoomIdOrAlias
            )}/date/${startUrlDateTime}`;

            // Loop through all of the pages of the test and ensure expectations
            let alreadyEncounteredLastPage = false;
            for (const pageKey of pagesKeyList) {
              try {
                if (alreadyEncounteredLastPage) {
                  assert.fail(
                    'We should not see any more pages after we already saw a page without an action ' +
                      `which signals the end of expecations. Encountered ${pageKey} in ${pagesKeyList} ` +
                      'after we already thought we were done'
                  );
                }

                const pageTestMeta = testCase[pageKey];
                const {
                  roomIdOrAlias: expectedRoomFancyId,
                  //urlDateTime: expectedUrlDateTime,
                  continueAtEvent: expectedContinueAtEvent,
                } = parseArchiveUrlForRoom(urlJoin('https://example.com', pageTestMeta.url));
                const expectedRoomId = fancyIdentifierToRoomIdMap.get(expectedRoomFancyId);
                assert(
                  expectedRoomId,
                  `Could not find room ID for ${expectedRoomFancyId} in our list of known rooms ${JSON.stringify(
                    Object.fromEntries(fancyIdentifierToRoomIdMap.entries()),
                    null,
                    2
                  )}`
                );

                // Fetch the given page.
                const { data: archivePageHtml, res: pageRes } = await fetchEndpointAsText(
                  archiveUrl
                );
                const pageDom = parseHTML(archivePageHtml);

                const eventIdsOnPage = [...pageDom.document.querySelectorAll(`[data-event-id]`)]
                  // eslint-disable-next-line max-nested-callbacks
                  .map((eventEl) => {
                    return eventEl.getAttribute('data-event-id');
                  });

                // Assert the correct room and time precision in the URL
                const actualUrlWithFancyIdentifies = convertActualUrlToUrlWithFancyIds(pageRes.url);
                assert.match(
                  actualUrlWithFancyIdentifies,
                  new RegExp(`${escapeStringRegexp(pageTestMeta.url)}$`),
                  `The actual URL (${actualUrlWithFancyIdentifies}) for the page did not match the expected URL (${
                    pageTestMeta.url
                  }).\nFor reference, here are the events on the page: ${JSON.stringify(
                    eventIdsOnPage,
                    null,
                    2
                  )}\n${getDebugStringForEventsInRoomsAndLookForEventId()}`
                );

                // If provided, assert that it's a smooth continuation to more messages.
                // First by checking where the scroll is going to start from
                if (expectedContinueAtEvent) {
                  const [expectedContinuationDebugEventId] =
                    convertFancyIdentifierListToDebugEventIds([expectedContinueAtEvent]);
                  const urlObj = new URL(pageRes.url, basePath);
                  const qs = new URLSearchParams(urlObj.search);
                  const continuationEventId = qs.get('at');
                  if (!continuationEventId) {
                    throw new Error(
                      `Expected ?at=$xxx query parameter to be defined in the URL=${pageRes.url} but it was ${continuationEventId}. We expect it to match ${expectedContinuationDebugEventId}`
                    );
                  }
                  const [continationDebugEventId] = convertEventIdsToDebugEventIds([
                    continuationEventId,
                  ]);
                  assert.strictEqual(continationDebugEventId, expectedContinuationDebugEventId);
                }

                // We only care about messages for now (no easy way to specify the
                // primordial room creation or member events in the test expectations)
                const eventIdsOnPageWeCareAboutToAssert = eventIdsOnPage.filter((eventId) => {
                  const event = eventMap.get(eventId);
                  if (!event) {
                    return false;
                  }

                  assert(
                    event?.type,
                    `Event should have a type: ${JSON.stringify(event, null, 2)}}`
                  );
                  return event?.type === 'm.room.message';
                });

                const pageNumber = pageKey.replace('page', '');
                const page = pages[pageNumber - 1];
                const expectedEventsOnPage = page.events;
                const expectedFancyIdsOnPage = expectedEventsOnPage.map(
                  // eslint-disable-next-line max-nested-callbacks
                  (event) => `$event${event.eventNumber}`
                );

                // Assert that the page contains all expected events
                assert.deepEqual(
                  convertEventIdsToDebugEventIds(eventIdsOnPageWeCareAboutToAssert),
                  convertFancyIdentifierListToDebugEventIds(expectedFancyIdsOnPage),
                  `Events on ${pageKey} should be as expected`
                );

                // Follow the next activity link. Aka, fetch messages for the 2nd page
                let actionLinkSelector;
                let nextPageLink;
                if (pageTestMeta.action === 'next') {
                  actionLinkSelector = '[data-testid="jump-to-next-activity-link"]';
                } else if (pageTestMeta.action === 'previous') {
                  actionLinkSelector = '[data-testid="jump-to-previous-activity-link"]';
                } else if (pageTestMeta.action?.startsWith('navigate:')) {
                  const navigateUrlWithFancyIds = pageTestMeta.action.replace('navigate:', '');
                  const fullNavigateUrlWithFancyIds = urlJoin(basePath, navigateUrlWithFancyIds);
                  nextPageLink = convertUrlWithFancyIdsToActualUrl(fullNavigateUrlWithFancyIds);
                } else if (pageTestMeta.action === null) {
                  // No more pages to test ✅, move on
                  alreadyEncounteredLastPage = true;
                  continue;
                } else {
                  throw new Error(
                    `Unexpected value for ${pageKey}.action=${pageTestMeta.action} that we don't know what to do with`
                  );
                }

                if (actionLinkSelector) {
                  const jumpToActivityLinkEl = pageDom.document.querySelector(actionLinkSelector);
                  const jumpToActivityLinkHref = jumpToActivityLinkEl.getAttribute('href');
                  nextPageLink = jumpToActivityLinkHref;
                }

                // Move to the next iteration of the loop
                //
                // Set this for debugging if the test fails here
                archiveUrl = nextPageLink;
              } catch (err) {
                const errorWithContext = new RethrownError(
                  `Encountered error while asserting ${pageKey}: (see original error below)`,
                  err
                );
                // Copy these over so mocha generates a nice diff for us
                if (err instanceof assert.AssertionError) {
                  errorWithContext.actual = err.actual;
                  errorWithContext.expected = err.expected;
                }
                throw errorWithContext;
              }
            }
          });
        }

        const jumpTestCases = [
          {
            // In order to jump from the 1st page to the 2nd, we first jump forward 4
            // messages, then back-track to the first date boundary which is day3. We do
            // this so that we don't start from day4 backwards which would miss messages
            // because there are more than 5 messages in between day4 and day2.
            //
            // Even though there is overlap between the pages, our scroll continues from
            // the event where the 1st page starts.
            testName: 'can jump forward to the next activity',
            // Create enough surround messages on nearby days that overflow the page
            // limit but don't overflow the limit on a single day basis. We create 4
            // days of messages so we can see a seamless continuation from page1 to
            // page2.
            roomDayMessageStructureString: `
              [room1                                                               ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12
              [day1       ]     [day2       ]     [day3       ]     [day4          ]
                    [page1                  ]
                                            |--jump-fwd-4-messages-->|
                                      [page2                  ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/02',
            page1: {
              url: '/roomid/room1/date/2022/01/02',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/03?at=$event7',
              action: null,
            },
          },
          {
            // This test is just slightly different and jumps further into day4 (just a
            // slight variation to make sure it still does the correct thing)
            //
            // In order to jump from the 1st page to the 2nd, we first jump forward 4
            // messages, then back-track to the first date boundary which is day3. There
            // is exactly 5 messages between day4 and day2 which would be a perfect next
            // page but because we hit the middle of day4, we have no idea how many more
            // messages are in day4.
            //
            // Even though there is overlap between the pages, our scroll continues from
            // the event where the 1st page starts.
            testName: 'can jump forward to the next activity2',
            roomDayMessageStructureString: `
              [room1                                                        ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11
              [day1       ]     [day2       ]     [day3 ]     [day4         ]
                    [page1                  ]
                                            |--jump-fwd-4-messages-->|
                                [page2                  ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/02',
            page1: {
              url: '/roomid/room1/date/2022/01/02',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/03?at=$event7',
              action: null,
            },
          },
          {
            // In order to jump from the 1st page to the 2nd, we first "jump" forward 4
            // messages by paginating `/messages?limit=4` but it only returns 2x
            // messages (event11 and event12) which is less than our limit of 4, so we
            // know we reached the end and can simply display the day that the latest
            // event occured on.
            testName: 'can jump forward to the latest activity in the room (same day)',
            roomDayMessageStructureString: `
              [room1                                                               ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12
              [day1       ]     [day2       ]     [day3       ]     [day4          ]
                                            [page1                   ]
                                                                     |--jump-fwd-4-messages-->|
                                                        [page2                     ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/04T01:00',
            page1: {
              url: '/roomid/room1/date/2022/01/04T01:00',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/04?at=$event11',
              action: null,
            },
          },
          {
            // In order to jump from the 1st page to the 2nd, we first "jump" forward 4
            // messages by paginating `/messages?limit=4` but it only returns 3x
            // messages (event10, event11, event12) which is less than our limit of 4,
            // so we know we reached the end and can simply display the day that the
            // latest event occured on.
            testName: 'can jump forward to the latest activity in the room (different day)',
            roomDayMessageStructureString: `
              [room1                                                               ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12
              [day1       ]     [day2       ]     [day3       ]     [day4          ]
                                      [page1                  ]
                                                              |---jump-fwd-4-messages--->|
                                                        [page2                     ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/03',
            page1: {
              url: '/roomid/room1/date/2022/01/03',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/04?at=$event10',
              action: null,
            },
          },
          // This test currently doesn't work because it finds the primordial room
          // creation events which are created in now time vs the timestamp massaging we
          // do for the message fixtures. We can uncomment this once Synapse supports
          // timestamp massaging for `/createRoom`, see
          // https://github.com/matrix-org/matrix-public-archive/issues/169
          //
          // {
          //   // In order to jump from the 1st page to the 2nd, we first "jump" forward 4
          //   // messages by paginating `/messages?limit=4` but it returns no messages
          //   // which is less than our limit of 4, so we know we reached the end and can
          //   // simply TODO
          //   testName:
          //     'can jump forward to the latest activity in the room (when already viewing the latest activity)',
          //   roomDayMessageStructureString: `
          //     [room1                                                               ]
          //     1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12
          //     [day1       ]     [day2       ]     [day3       ]     [day4          ]
          //                                               [page1                     ]
          //                                                                          |---jump-fwd-4-messages--->|
          //                                               [page2                     ]
          //   `,
          //   archiveMessageLimit: 4,
          //   startUrl: '/roomid/room1/date/2022/01/04',
          //   page1: {
          //     url: '/roomid/room1/date/2022/01/04',
          //     action: 'next',
          //   },
          //   page2: {
          //     // If we can't find any more messages to paginate to, we just progress the
          //     // date forward by a day so we can display the empty view for that day.
          //     //
          //     // TODO: This page probably doesn't need a `?at=` continue event
          //     url: '/roomid/room1/date/2022/01/05?at=TODO',
          //     action: null,
          //   },
          // },
          {
            // Test to make sure we can jump from the 1st page to the 2nd page forwards
            // even when it exactly paginates to the last message of the next day. We're
            // testing this specifically to ensure that you actually jump to the next
            // day (previously failed with naive flawed code).
            //
            // In order to jump from the 1st page to the 2nd, we first jump forward 3
            // messages, then back-track to the first date boundary which is the nearest
            // hour backwards from event9. We use the nearest hour because there is
            // less than a day of gap between event6 and event9 and we fallback from
            // nearest day to hour boundary.
            //
            testName:
              'can jump forward to the next activity even when it exactly goes to the end of the next day',
            roomDayMessageStructureString: `
              [room1                                                               ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12
              [day1       ]     [day2       ]     [day3       ]     [day4          ]
                          [page1            ]
                                            |-jump-fwd-3-msg->|
                                      [page2            ]
            `,
            archiveMessageLimit: 3,
            startUrl: '/roomid/room1/date/2022/01/02',
            page1: {
              url: '/roomid/room1/date/2022/01/02',
              action: 'next',
            },
            page2: {
              // We expect the URL to look like `T02:00` because we're rendering part way
              // through day3 and while we could get away with just hour precision, the
              // default precision has hours and minutes.
              url: '/roomid/room1/date/2022/01/03T02:00?at=$event7',
              action: null,
            },
          },
          {
            // From the first page with too many messages, starting at event5(page1
            // rangeStart), we look backwards for the closest event. Because we find
            // event4 as the closest, which is from a different day from event9(page1
            // rangeEnd), we can just display the time where event4 resides.
            testName: 'can jump backward to the previous activity',
            roomDayMessageStructureString: `
              [room1                                                               ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12
              [day1       ]     [day2       ]     [day3       ]     [day4          ]
                                      [page1                  ]
              [page2            ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/03',
            page1: {
              url: '/roomid/room1/date/2022/01/03',
              action: 'previous',
            },
            page2: {
              // Continuing from the first event of day2 since we already saw the rest
              // of day2 in the first page
              url: '/roomid/room1/date/2022/01/02T01:00?at=$event4',
              action: null,
            },
          },
          {
            // In order to jump from the 1st page to the 2nd, we first jump forward 8
            // messages, then back-track to the first date boundary which is the nearest
            // day backwards from event20. We use the nearest day because there is more
            // than a day of gap between event12 and event20.
            testName:
              'can jump forward over many quiet days without losing any messages in the gap',
            roomDayMessageStructureString: `
              [room1                                                                                                                              ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14 <-- 15 <-- 16 <-- 17 <-- 18 <-- 19 <-- 20 <-- 21
              [day1       ]     [day2       ]     [day3       ]     [day4          ]     [day5   ]     [day6   ]     [day7   ]     [day8          ]
                                [page1                                             ]
                                                                                   |------------------jump-fwd-8-msg---------------------->|
                                                                    [page2                                                   ]
            `,
            archiveMessageLimit: 8,
            startUrl: '/roomid/room1/date/2022/01/04',
            page1: {
              url: '/roomid/room1/date/2022/01/04',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/07?at=$event13',
              action: null,
            },
          },
          {
            // From the first page with too many messages, starting at event13 (page1
            // rangeStart), we look backwards for the closest event. Because we find
            // event12 as the closest, which is from the a different day from event21
            // (page1 rangeEnd), we can just display the day where event12 resides.
            testName: 'can jump backward to the previous activity with many small quiet days',
            roomDayMessageStructureString: `
              [room1                                                                                                                              ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14 <-- 15 <-- 16 <-- 17 <-- 18 <-- 19 <-- 20 <-- 21
              [day1 ]     [day2 ]     [day3 ]     [day4 ]     [day5  ]     [day6   ]     [day7          ]     [day8          ]     [day9          ]
                                                                                         [page1                                                   ]
                                [page2                                             ]
            `,
            archiveMessageLimit: 8,
            startUrl: '/roomid/room1/date/2022/01/09',
            page1: {
              url: '/roomid/room1/date/2022/01/09',
              action: 'previous',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/06?at=$event12',
              action: null,
            },
          },
          {
            // Test to make sure we can jump forwards from the 1st page to the 2nd page
            // with too many messages to display on a single day.
            //
            // We jump forward 4 messages (`archiveMessageLimit`), then back-track to
            // the nearest hour which starts us from event9, and then we display 5
            // messages because we fetch one more than `archiveMessageLimit` to
            // determine overflow.
            testName: 'can jump forward to the next activity and land in too many messages',
            roomDayMessageStructureString: `
              [room1                                                                                    ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14 <-- 15
              [day1       ]     [day2       ]     [day3                            ]     [day4          ]
                    [page1                  ]
                                            |--jump-fwd-4-messages-->|
                                      [page2                  ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/02',
            page1: {
              url: '/roomid/room1/date/2022/01/02',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/03T03:00?at=$event7',
              action: null,
            },
          },
          {
            // Test to make sure we can jump forwards from the 1st page to the 2nd page
            // when there is a multiple-day gap between the end of the first page to the
            // next messages.
            //
            // We jump forward 4 messages (`archiveMessageLimit`), then back-track to
            // the nearest hour because even though there is more than a day gap in the
            // jump, there aren't any mesages in between from another day. Because, we
            // back-tracked to the nearest hour, this starts us from event9, and then we
            // display 5 messages because we fetch one more than `archiveMessageLimit`
            // to determine overflow.
            testName: 'can jump forward to the next activity when there is a multiple day gap',
            roomDayMessageStructureString: `
              [room1                                                               ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 
              [day1                         ]     [day5                            ]
                    [page1                  ]
                                            |--jump-fwd-4-messages-->|
                                      [page2                  ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/01',
            page1: {
              url: '/roomid/room1/date/2022/01/01',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/05T03:00?at=$event7',
              action: null,
            },
          },
          {
            // Test to make sure we can jump backwards from the 1st page to the 2nd page
            // with too many messages to display on a single day.
            //
            // From the first page with too many messages, starting at event10 (page1
            // rangeStart), we look backwards for the closest event. Because we find
            // event9 as the closest, which is from the a different day from event14
            // (page1 rangeEnd), we can just display the day where event9 resides.
            testName: 'can jump backward to the previous activity and land in too many messages',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1       ]     [day2                         ]     [day3          ]     [day4   ]
                                                                    [page1                       ]
                                      [page2                  ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/04',
            page1: {
              url: '/roomid/room1/date/2022/01/04',
              action: 'previous',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/02?at=$event9',
              action: null,
            },
          },
          {
            // We jump forward 4 messages (`archiveMessageLimit`) to event12, then
            // back-track to the nearest hour which starts off at event11 and render the
            // page with 5 messages because we fetch one more than `archiveMessageLimit`
            // to determine overflow.
            testName:
              'can jump forward from one day with too many messages into the next day with too many messages',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1 ]     [day2                         ]     [day3                              ]
                                [page1                  ]
                                                        |---jump-fwd-4-messages--->|
                                                  [page2                    ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/02',
            page1: {
              url: '/roomid/room1/date/2022/01/02',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/03T03:00?at=$event9',
              action: null,
            },
          },
          {
            // From the first page with too many messages, starting at event10 (page1
            // rangeStart), we look backwards for the closest event. Because we find
            // event9 as the closest, which is from the same day as event14 (page1
            // rangeEnd), we round up to the nearest hour so that the URL encompasses it
            // when looking backwards.
            testName:
              'can jump backward from one day with too many messages into the previous day with too many messages',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1 ]     [day2                         ]     [day3                              ]
                                                                    [page1                       ]
                                      [page2                  ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/03',
            page1: {
              url: '/roomid/room1/date/2022/01/03',
              action: 'previous',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/03T01:00?at=$event9',
              action: null,
            },
          },
          {
            // We jump forward 4 messages (`archiveMessageLimit`) to event12, then
            // back-track to the nearest hour which starts off at event11 and render the
            // page with 5 messages because we fetch one more than `archiveMessageLimit`
            // to determine overflow.
            testName:
              'can jump forward from one day with too many messages into the same day with too many messages',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1 ]     [day2                                                                  ]
                                [page1                  ]
                                                        |---jump-fwd-4-messages--->|
                                                  [page2                    ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/02T6:00',
            page1: {
              url: '/roomid/room1/date/2022/01/02T6:00',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/02T09:00?at=$event9',
              action: null,
            },
          },
          {
            // From the first page with too many messages, starting at event10 (page1
            // rangeStart), we look backwards for the closest event. Because we find
            // event9 as the closest, which is from the same day as event14 (page1
            // rangeEnd), we round up to the nearest hour so that the URL encompasses it
            // when looking backwards.
            testName:
              'can jump backward from one day with too many messages into the same day with too many messages',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1 ]     [day2                                                                  ]
                                                              [page1                      ]
                                [page2                  ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/02T11:00',
            page1: {
              url: '/roomid/room1/date/2022/01/02T11:00',
              action: 'previous',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/02T06:00?at=$event8',
              action: null,
            },
          },
          {
            // We jump forward 4 messages (`archiveMessageLimit`) to event12, then
            // back-track to the nearest hour which starts off at event11 and render the
            // page with 5 messages because we fetch one more than `archiveMessageLimit`
            // to determine overflow.
            testName:
              'can jump forward from the middle of one day with too many messages into the next day with too many messages',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1 ]     [day2                               ]     [day3                        ]
                                [page1                  ]
                                                        |---jump-fwd-4-messages--->|
                                                  [page2                    ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/02T06:00',
            page1: {
              url: '/roomid/room1/date/2022/01/02T06:00',
              action: 'next',
            },
            page2: {
              // Continuing from the unseen event in day2
              url: '/roomid/room1/date/2022/01/03T02:00?at=$event9',
              action: null,
            },
          },
          {
            // From the first page with too many messages, starting at event10 (page1
            // rangeStart), we look backwards for the closest event. Because we find
            // event9 as the closest, which is from the same day as event14 (page1
            // rangeEnd), we round up to the nearest hour so that the URL encompasses it
            // when looking backwards.
            testName:
              'can jump backward from the middle of one day with too many messages into the previous day with too many messages',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1 ]     [day2                   ]     [day3                                    ]
                                                              [page1                      ]
                                [page2                  ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/03T06:00',
            page1: {
              url: '/roomid/room1/date/2022/01/03T06:00',
              action: 'previous',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/03T01:00?at=$event8',
              action: null,
            },
          },
          {
            // From the first page with too many messages, starting at event8 (page1
            // rangeStart), we look backwards for the closest event. Because we find
            // event7 as the closest, which is from a different day than event12 (page1
            // rangeEnd), we can just display the day where event7 resides.
            testName:
              'can jump backward from the start of one day with too many messages into the previous day with exactly the limit',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1 ]     [day2                   ]     [day3                                    ]
                                                        [page1                     ]
                          [page2                  ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/03T05:00',
            page1: {
              url: '/roomid/room1/date/2022/01/03T05:00',
              action: 'previous',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/02?at=$event7',
              action: null,
            },
          },
          // Tests for "less than X" for the forwards direction
          // --------------------------------------------------
          {
            // From the first page with too many messages, starting at event14 with
            // minute precision in the URL, we look backwards for the closest event.
            // Because we find event9 as the closest, where the page1
            // `currentRangeStartTs` is less than an hour away from event9, we have to
            // round up to the nearest minute.
            testName:
              'can jump backward to the previous activity when less than an hour between all messages',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1                                                                              ]
                                                                    [page1                       ]
                                      [page2                  ]
            `,
            // More than a minute for each but less than an hour when you multiply this
            // across all of messages
            timeIncrementBetweenMessages: 2 * ONE_MINUTE_IN_MS,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/01T01:00',
            page1: {
              url: '/roomid/room1/date/2022/01/01T01:00',
              action: 'previous',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/01T00:17?at=$event9',
              action: null,
            },
          },
          {
            // From the first page with too many messages, starting at event14 with
            // day precision in the URL, we look backwards for the closest event.
            // Because we find event9 as the closest, where the page1
            // `currentRangeStartTs` is less than an hour away from event9, we have to
            // round up to the nearest minute.
            testName:
              'can jump backward to the previous activity when less than an hour between all messages (starting from day precision)',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1                                                                              ]
                                                                    [page1                       ]
                                      [page2                  ]
            `,
            // More than a minute for each but less than an hour when you multiply this
            // across all of messages
            timeIncrementBetweenMessages: 2 * ONE_MINUTE_IN_MS,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/01',
            page1: {
              url: '/roomid/room1/date/2022/01/01',
              action: 'previous',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/01T00:17?at=$event9',
              action: null,
            },
          },
          {
            // From the first page with too many messages, starting at event14 with
            // minute precision in the URL, we look backwards for the closest event.
            // Because we find event9 as the closest, where the page1
            // `currentRangeStartTs` is less than an minute away from event9, we have to
            // round up to the nearest second.
            testName:
              'can jump backward to the previous activity when less than an minute between all messages',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1                                                                              ]
                                                                    [page1                       ]
                                      [page2                  ]
            `,
            // More than a second for each but less than an minute when you multiply
            // this across all of messages
            timeIncrementBetweenMessages: 2 * ONE_SECOND_IN_MS,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/01T00:01',
            page1: {
              url: '/roomid/room1/date/2022/01/01T00:01',
              action: 'previous',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/01T00:00:17?at=$event9',
              action: null,
            },
          },
          {
            // From the first page with too many messages, starting at event14 with
            // day precision in the URL, we look backwards for the closest event.
            // Because we find event9 as the closest, where the page1
            // `currentRangeStartTs` is less than an minute away from event9, we have to
            // round up to the nearest second.
            testName:
              'can jump backward to the previous activity when less than an minute between all messages (starting from day precision)',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1                                                                              ]
                                                                    [page1                       ]
                                      [page2                  ]
            `,
            // More than a second for each but less than an minute when you multiply
            // this across all of messages
            timeIncrementBetweenMessages: 2 * ONE_SECOND_IN_MS,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/01',
            page1: {
              url: '/roomid/room1/date/2022/01/01',
              action: 'previous',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/01T00:00:17?at=$event9',
              action: null,
            },
          },
          // Tests for "less than X" for the forwards direction
          // --------------------------------------------------
          // We can't do the `(start from day precision)` variants when jumping forwards
          // because day precision starts off at `T23:59:59.999Z` and jumping forward
          // will always land us in the next day.
          {
            // We jump forward 4 messages (`archiveMessageLimit`) to event10, then
            // back-track to the nearest minute which starts off at event9 and render the
            // page with 5 messages because we fetch one more than `archiveMessageLimit`
            // to determine overflow.
            testName:
              'can jump forward to the next activity when less than an hour between all messages',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1                                                                              ]
                    [page1                  ]
                                            |--jump-fwd-4-messages-->|
                                      [page2                  ]
            `,
            // More than a minute for each but less than an hour when you multiply this
            // across all of messages
            timeIncrementBetweenMessages: 2 * ONE_MINUTE_IN_MS,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/01T00:11',
            page1: {
              url: '/roomid/room1/date/2022/01/01T00:11',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/01T00:18?at=$event7',
              action: null,
            },
          },
          {
            // We jump forward 4 messages (`archiveMessageLimit`) to event10, then
            // back-track to the nearest second which starts off at event9 and render the
            // page with 5 messages because we fetch one more than `archiveMessageLimit`
            // to determine overflow.
            testName:
              'can jump forward to the next activity when less than an minute between all messages',
            roomDayMessageStructureString: `
              [room1                                                                             ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1                                                                              ]
                    [page1                  ]
                                            |--jump-fwd-4-messages-->|
                                      [page2                  ]
            `,
            // More than a second for each but less than an minute when you multiply this
            // across all of messages
            timeIncrementBetweenMessages: 2 * ONE_SECOND_IN_MS,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room1/date/2022/01/01T00:00:11',
            page1: {
              url: '/roomid/room1/date/2022/01/01T00:00:11',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/01T00:00:18?at=$event7',
              action: null,
            },
          },
        ];

        const jumpBackwardPredecessorTestCases = [
          {
            // Page2 only shows 4 messages ($event4-7) instead of 5
            // (`archiveMessageLimit` + 1) because it also has the tombstone event which
            // is hidden
            testName: 'can jump backward from one room to the predecessor room (different day)',
            roomDayMessageStructureString: `
              [room1                              ]     [room2                                   ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1 ]     [day2                   ]     [day3                                    ]
                                                        [page1                     ]
                                [page2            ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room2/date/2022/01/03T05:00',
            page1: {
              url: '/roomid/room2/date/2022/01/03T05:00',
              action: 'previous',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/02?at=$tombstone',
              action: null,
            },
          },
          {
            // Page2 only shows 4 messages ($event4-7) instead of 5
            // (`archiveMessageLimit` + 1) because it also has the tombstone event which
            // is hidden
            testName: 'can jump backward from one room to the predecessor room (same day)',
            roomDayMessageStructureString: `
              [room1                              ]     [room2                                   ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1 ]     [day2                                                                  ]
                                                        [page1                     ]
                                [page2            ]
            `,
            archiveMessageLimit: 4,
            startUrl: '/roomid/room2/date/2022/01/02T10:00',
            page1: {
              url: '/roomid/room2/date/2022/01/02T10:00',
              action: 'previous',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/02?at=$tombstone',
              action: null,
            },
          },
          {
            // Page2 only shows 3 messages ($event2-4) instead of 4
            // (`archiveMessageLimit` + 1) because it also has the tombstone event which
            // is hidden
            testName: 'jumping back before room was created will go down the predecessor chain',
            roomDayMessageStructureString: `
              [room1            ]     [room2            ]     [room3               ]     [room4                ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14 <-- 15 <-- 16
              [day1 ]     [day2 ]     [day3 ]     [day4 ]     [day5  ]     [day6   ]     [day7   ]     [day8   ]
                                                                                         [page1                ]
                    [page2      ]
            `,
            archiveMessageLimit: 3,
            startUrl: '/roomid/room4/date/2022/01/08',
            page1: {
              url: '/roomid/room4/date/2022/01/08',
              action: 'navigate:/roomid/room4/date/2022/01/02',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/02',
              action: null,
            },
          },
          // This doesn't work well because of the primordial create room events which
          // we can't control the timestamp of or assert properly in this diagram. If we
          // ever get timestamp massaging on the `/createRoom` endpoint (see
          // https://github.com/matrix-org/matrix-public-archive/issues/169), we could
          // make this work by increasing the `archiveMessageLimit` to something that
          // would encompass all of the primordial events along with the last few
          // messages.
          //
          // {
          //   testName: `will paginate to the oldest messages in the room (doesn't skip the last few) before jumping backward to the predecessor room`,
          //   roomDayMessageStructureString: `
          //     [room1                              ]     [room2                                   ]
          //     1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
          //     [day1 ]     [day2                   ]     [day3                                    ]
          //                                                           [page1                       ]
          //                                               [page2]
          //                 [page3                  ]
          //   `,
          //   archiveMessageLimit: 4,
          //   startUrl: '/roomid/room2/date/2022/01/03',
          //   page1: {
          //     url: '/roomid/room2/date/2022/01/03',
          //     action: 'previous',
          //   },
          //   page2: {
          //     url: '/roomid/room2/date/2022/01/03T02:00?at=$event9',
          //     action: 'previous',
          //   },
          //   page3: {
          //     url: '/roomid/room1/date/2022/01/02',
          //     action: null,
          //   },
          // },
        ];

        const jumpForwardSuccessorTestCases = [
          {
            // We jump from event3 which is found as the closest event looking forward
            // from the ts=0 in the successor room because the timestamp massaged events
            // come before `m.room.create` and other primordial events here (related to
            // https://github.com/matrix-org/matrix-public-archive/issues/169). From
            // event3, we jump forward 10 messages (`archiveMessageLimit`) to event12,
            // then back-track to the nearest hour which starts off at event11 and try
            // to render the page with 11 messages because we fetch one more than
            // `archiveMessageLimit` to determine overflow but there aren't enough
            // messages.
            testName: 'can jump forward from one room to the successor room (different day)',
            roomDayMessageStructureString: `
              [room1]     [room2                                                                 ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1 ]     [day2                                                                  ]
              [page1]
                          |------------------jump-fwd-10-messages----------------->|
                          [page2                                            ]
            `,
            archiveMessageLimit: 10,
            startUrl: '/roomid/room1/date/2022/01/01',
            page1: {
              url: '/roomid/room1/date/2022/01/01',
              action: 'next',
            },
            page2: {
              url: '/roomid/room2/date/2022/01/02T09:00?at=$event3',
              action: null,
            },
          },
          {
            // We jump from event8 which is found as the closest event looking forward
            // from the ts=0 in the successor room because the timestamp massaged events
            // come before `m.room.create` and other primordial events here (related to
            // https://github.com/matrix-org/matrix-public-archive/issues/169). From
            // event8, we jump forward 10 messages (`archiveMessageLimit`) to the end of
            // the room, then go to the day of the last message which will show us all
            // messages in room2 because we fetch one more than `archiveMessageLimit` to
            // determine overflow which is more messages than room2 has.
            testName: 'can jump forward from one room to the successor room (same day)',
            roomDayMessageStructureString: `
              [room1                              ]     [room2                                   ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1 ]     [day2                                                                  ]
              [page1                              ]
                                                        |------------------jump-fwd-10-messages----------------------->|
                                                        [page2                                   ]
            `,
            archiveMessageLimit: 10,
            startUrl: '/roomid/room1/date/2022/01/02T05:00',
            page1: {
              url: '/roomid/room1/date/2022/01/02T05:00',
              action: 'next',
            },
            page2: {
              url: '/roomid/room2/date/2022/01/02?at=$event8',
              action: null,
            },
          },
          {
            // We jump from event3 which is found as the closest event looking forward
            // from the ts=0 in the successor room because the timestamp massaged events
            // come before `m.room.create` and other primordial events here (related to
            // https://github.com/matrix-org/matrix-public-archive/issues/169). From
            // event3, we jump forward 10 messages (`archiveMessageLimit`) to event13,
            // then back-track to the nearest hour which starts off at event11 and try
            // to render the page with 11 messages because we fetch one more than
            // `archiveMessageLimit` to determine overflow but there aren't enough
            // messages.
            testName: 'can jump forward from one room to the successor room (multiple day gap)',
            roomDayMessageStructureString: `
              [room1]     [room2                                                                 ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
              [day1 ]     [day5                                                                  ]
              [page1]
                          |----------------jump-fwd-10-messages------------------->|
                          [page2                                            ]
            `,
            archiveMessageLimit: 10,
            startUrl: '/roomid/room1/date/2022/01/01',
            page1: {
              url: '/roomid/room1/date/2022/01/01',
              action: 'next',
            },
            page2: {
              url: '/roomid/room2/date/2022/01/05T09:00?at=$event3',
              action: null,
            },
          },
          {
            // For the jump from page1 to page2, we jump forward 10 messages which gets
            // us to the end of the room.
            //
            // For the jump from page2 to page3, since we see the end of room1, we jump
            // to the successor room and find the closest event from ts=0 looking
            // forward which is event5 because the timestamp massaged events come before
            // `m.room.create` and other primordial events here (related to
            // https://github.com/matrix-org/matrix-public-archive/issues/169). From
            // event5, we jump forward 10 messages (`archiveMessageLimit`) to event14,
            // then back-track to the *day* before the last message found which starts off
            // at event6 and try to render the page with 11 messages because we fetch
            // one more than `archiveMessageLimit` to determine overflow but there
            // aren't enough messages.
            //
            // For the jump from page3 to page4, we jump forward 10 messages to event16,
            // then back-track to the nearest hour which starts off at event15 and try
            // to render the page with 11 messages because we fetch one more than
            // `archiveMessageLimit`.
            testName: 'can jump forward from one room to the successor room (across multiple days)',
            roomDayMessageStructureString: `
              [room1            ]     [room2                                                                   ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14 <-- 15 <-- 16
              [day1 ]     [day2             ]     [day3                                                        ]
              [page1]
                    |--jump-10->|
              [page2            ]
                                      |------------------jump-fwd-10-messages------------------->|
                                      [page3]
                                            |----------------------jump-fwd-10-messages----------------------->|
                                      [page4                                                            ]
            `,
            archiveMessageLimit: 10,
            startUrl: '/roomid/room1/date/2022/01/01',
            page1: {
              url: '/roomid/room1/date/2022/01/01',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/02?at=$event3',
              action: 'next',
            },
            page3: {
              url: '/roomid/room2/date/2022/01/02?at=$event5',
              action: 'next',
            },
            page4: {
              url: '/roomid/room2/date/2022/01/03T09:00?at=$event7',
              action: null,
            },
          },
          {
            // (same as the test above just with more day gaps)
            testName:
              'can jump forward from one room to the successor room (across multiple days and day gaps)',
            roomDayMessageStructureString: `
              [room1            ]     [room2                                                                   ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14 <-- 15 <-- 16
              [day1 ]     [day4             ]     [day6                                                        ]
              [page1]
                    |--jump-10->|
              [page2            ]
                                      |------------------jump-fwd-10-messages------------------->|
                                      [page3]
                                            |----------------------jump-fwd-10-messages----------------------->|
                                      [page4                                                            ]
            `,
            archiveMessageLimit: 10,
            startUrl: '/roomid/room1/date/2022/01/01',
            page1: {
              url: '/roomid/room1/date/2022/01/01',
              action: 'next',
            },
            page2: {
              url: '/roomid/room1/date/2022/01/04?at=$event3',
              action: 'next',
            },
            page3: {
              // You might expect `/date/2022/01/04?at=$event5` here but we just get the
              // UTC day before the day of last message we jumped to (event14)
              url: '/roomid/room2/date/2022/01/05?at=$event5',
              action: 'next',
            },
            page4: {
              url: '/roomid/room2/date/2022/01/06T09:00?at=$event7',
              action: null,
            },
          },
          {
            testName: 'jumping forward past the end of the room will go down the successor chain',
            roomDayMessageStructureString: `
              [room1            ]     [room2            ]     [room3               ]     [room4                ]
              1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14 <-- 15 <-- 16
              [day1 ]     [day2 ]     [day3 ]     [day4 ]     [day5  ]     [day6   ]     [day7   ]     [day8   ]
                    [page1      ]
                                                                                         [page2                ]
            `,
            archiveMessageLimit: 3,
            startUrl: '/roomid/room1/date/2022/01/02',
            page1: {
              url: '/roomid/room1/date/2022/01/02',
              action: 'navigate:/roomid/room1/date/2022/01/08',
            },
            page2: {
              url: '/roomid/room4/date/2022/01/08',
              action: null,
            },
          },
        ];

        jumpTestCases.forEach((testCase) => {
          runJumpTestCase(testCase);
        });

        describe('with room upgrades', () => {
          describe('jump backward into predecessor rooms', () => {
            // eslint-disable-next-line max-nested-callbacks
            jumpBackwardPredecessorTestCases.forEach((testCase) => {
              runJumpTestCase(testCase);
            });
          });

          describe('jump forward from tombstone to replacement/successor rooms', () => {
            // eslint-disable-next-line max-nested-callbacks
            jumpForwardSuccessorTestCases.forEach((testCase) => {
              runJumpTestCase(testCase);
            });
          });
        });

        const jumpPrecisionTestCases = [
          {
            durationMinLabel: 'day',
            durationMinMs: ONE_DAY_IN_MS,
            durationMaxLabel: 'multiple days',
            durationMaxMs: 5 * ONE_DAY_IN_MS,
            expectedTimePrecision: TIME_PRECISION_VALUES.none,
          },
          {
            durationMinLabel: 'hour',
            durationMinMs: ONE_HOUR_IN_MS,
            durationMaxLabel: 'day',
            durationMaxMs: ONE_DAY_IN_MS,
            expectedTimePrecision: TIME_PRECISION_VALUES.minutes,
          },
          {
            durationMinLabel: 'minute',
            durationMinMs: ONE_MINUTE_IN_MS,
            durationMaxLabel: 'hour',
            durationMaxMs: ONE_HOUR_IN_MS,
            expectedTimePrecision: TIME_PRECISION_VALUES.minutes,
          },
          {
            durationMinLabel: 'second',
            durationMinMs: ONE_SECOND_IN_MS,
            durationMaxLabel: 'minute',
            durationMaxMs: ONE_MINUTE_IN_MS,
            expectedTimePrecision: TIME_PRECISION_VALUES.seconds,
          },
          // This one is expected to fail but we could support it (#support-ms-time-slice)
          // {
          //   durationMinLabel: 'millisecond',
          //   durationMinMs: 1,
          //   durationMaxLabel: 'second',
          //   durationMaxMs: ONE_SECOND_IN_MS,
          //   // #support-ms-time-slice
          //   expectedTimePrecision: TIME_PRECISION_VALUES.milliseconds,
          // },
        ];

        [
          {
            directionLabel: 'backward',
            directionValue: DIRECTION.backward,
          },
          {
            directionLabel: 'forward',
            directionValue: DIRECTION.forward,
          },
        ].forEach(({ directionLabel, directionValue }) => {
          describe(`/jump redirects to \`/date/...\` URL that encompasses closest event when looking ${directionLabel}`, () => {
            // eslint-disable-next-line max-nested-callbacks
            jumpPrecisionTestCases.forEach((testCase) => {
              let testTitle;
              if (directionValue === DIRECTION.backward) {
                testTitle = `will jump to the nearest ${testCase.durationMinLabel} rounded up when the closest event is from the same ${testCase.durationMaxLabel} (but further than a ${testCase.durationMinLabel} away) as our currently displayed range of events`;
              } else if (directionValue === DIRECTION.forward) {
                testTitle = `will jump to the nearest ${testCase.durationMinLabel} rounded down when the last event in the next range is more than a ${testCase.durationMinLabel} away from our currently displayed range of events`;
              }

              // eslint-disable-next-line max-nested-callbacks
              it(testTitle, async () => {
                // The date should be just past midnight so we don't run into inclusive
                // bounds leaking messages from one day into another.
                const archiveDate = new Date(Date.UTC(2022, 0, 1, 0, 0, 0, 1));

                config.set('archiveMessageLimit', 3);

                const client = await getTestClientForHs(testMatrixServerUrl1);
                const roomId = await createTestRoom(client);

                const { eventIds, eventMap } = await createMessagesInRoom({
                  client,
                  roomId,
                  // Make sure there is enough space before and after the selected range
                  // for another page of history
                  numMessages: 10,
                  prefix: `foo`,
                  timestamp: archiveDate.getTime(),
                  increment: testCase.durationMinMs,
                });
                const fourthEvent = eventMap.get(eventIds[3]);
                const sixthEvent = eventMap.get(eventIds[5]);

                const jumpUrl = `${matrixPublicArchiveURLCreator.archiveJumpUrlForRoom(roomId, {
                  dir: directionValue,
                  currentRangeStartTs: fourthEvent.originServerTs,
                  currentRangeEndTs: sixthEvent.originServerTs,
                })}`;
                // Fetch the given page.
                const { res } = await fetchEndpointAsText(jumpUrl);

                // Assert the correct time precision in the URL
                assertExpectedTimePrecisionAgainstUrl(testCase.expectedTimePrecision, res.url);
              });
            });
          });
        });
      });
    });

    describe('Ensure setHeadersForDateTemporalContext(...) is being set properly (useful for caching)', async () => {
      // We can just use `new Date()` here but this just makes it more obvious what
      // our intention is here.
      const nowDate = new Date(Date.now());

      const testCases = [
        {
          testName: 'now is present',
          archiveDate: nowDate,
          expectedTemporalContext: 'present',
        },
        {
          testName: 'start of today is present',
          archiveDate: new Date(getUtcStartOfDayTs(nowDate)),
          expectedTemporalContext: 'present',
        },
        {
          testName: 'some time today is present',
          archiveDate: new Date(
            getUtcStartOfDayTs(nowDate) +
              12 * ONE_HOUR_IN_MS +
              30 * ONE_MINUTE_IN_MS +
              30 * ONE_SECOND_IN_MS
          ),
          expectedTemporalContext: 'present',
        },
        {
          testName: 'past is in the past',
          archiveDate: new Date('2020-01-01'),
          expectedTemporalContext: 'past',
        },
      ];

      let roomId;
      before(async () => {
        const client = await getTestClientForHs(testMatrixServerUrl1);
        roomId = await createTestRoom(client);
      });

      testCases.forEach((testCase) => {
        assert(testCase.testName);
        assert(testCase.archiveDate);
        assert(testCase.expectedTemporalContext);

        // Warn if it's close to the end of the UTC day. This test could be a flakey and
        // cause a failure if `expectedTemporalContext` was created just before midnight
        // (UTC) and we visit the archive after midnight (UTC). The
        // `X-Date-Temporal-Context` would read as `past` when we expect `present`.
        if (roundUpTimestampToUtcDay(nowDate) - nowDate.getTime() < 30 * 1000 /* 30 seconds */) {
          // eslint-disable-next-line no-console
          console.warn(
            `Test is being run at the end of the UTC day. This could result in a flakey ` +
              `failure if \`expectedTemporalContext\` was created just before midnight (UTC) ` +
              `and we visit the archive after midnight (UTC). Since ` +
              `this is an e2e test we can't control the date/time exactly.`
          );
        }

        it(testCase.testName, async () => {
          // Fetch the given page.
          archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(
            roomId,
            testCase.archiveDate
          );
          const { res } = await fetchEndpointAsText(archiveUrl);

          const dateTemporalContextHeader = res.headers.get('X-Date-Temporal-Context');
          assert.strictEqual(dateTemporalContextHeader, testCase.expectedTemporalContext);
        });
      });
    });

    describe('Room directory', () => {
      it('room search narrows down results', async () => {
        const client = await getTestClientForHs(testMatrixServerUrl1);
        // This is just an extra room to fill out the room directory and make sure
        // that it does not appear when searching.
        await createTestRoom(client);

        // Then create two rooms we will find with search
        //
        // We use a `timeToken` so that we can namespace these rooms away from other
        // test runs against the same homeserver
        const timeToken = Date.now();
        const roomPlanetPrefix = `planet-${timeToken}`;
        const roomSaturnName = `${roomPlanetPrefix}-saturn`;
        const roomSaturnId = await createTestRoom(client, {
          name: roomSaturnName,
        });
        const roomMarsName = `${roomPlanetPrefix}-mars`;
        const roomMarsId = await createTestRoom(client, {
          name: roomMarsName,
        });

        // Browse the room directory without search to see many rooms
        //
        // (we set this here in case we timeout while waiting for the test rooms to
        // appear in the room directory)
        archiveUrl = matrixPublicArchiveURLCreator.roomDirectoryUrl();

        // Try to avoid flakey tests where the homeserver hasn't added the rooms to the
        // room directory yet. This isn't completely robust as it doesn't check that the
        // random room at the start is in the directory but should be good enough.
        await waitForResultsInHomeserverRoomDirectory({
          client,
          searchTerm: roomSaturnName,
        });
        await waitForResultsInHomeserverRoomDirectory({
          client,
          searchTerm: roomMarsName,
        });

        const { data: roomDirectoryPageHtml } = await fetchEndpointAsText(archiveUrl);
        const dom = parseHTML(roomDirectoryPageHtml);

        const roomsOnPageWithoutSearch = [
          ...dom.document.querySelectorAll(`[data-testid="room-card"]`),
        ].map((roomCardEl) => {
          return roomCardEl.getAttribute('data-room-id');
        });

        // Then browse the room directory again, this time with the search
        // narrowing down results.
        archiveUrl = matrixPublicArchiveURLCreator.roomDirectoryUrl({
          searchTerm: roomPlanetPrefix,
        });
        const { data: roomDirectoryWithSearchPageHtml } = await fetchEndpointAsText(archiveUrl);
        const domWithSearch = parseHTML(roomDirectoryWithSearchPageHtml);

        const roomsOnPageWithSearch = [
          ...domWithSearch.document.querySelectorAll(`[data-testid="room-card"]`),
        ].map((roomCardEl) => {
          return roomCardEl.getAttribute('data-room-id');
        });

        // Assert that the rooms we searched for are visible
        assert.deepStrictEqual(roomsOnPageWithSearch.sort(), [roomSaturnId, roomMarsId].sort());

        // Sanity check that search does something. Assert that it's not showing
        // the same results as if we didn't make any search.
        assert.notDeepStrictEqual(roomsOnPageWithSearch.sort(), roomsOnPageWithoutSearch.sort());
      });

      it('can show rooms from another remote server', async () => {
        const hs2Client = await getTestClientForHs(testMatrixServerUrl2);

        // Create some rooms on hs2
        //
        // We use a `timeToken` so that we can namespace these rooms away from other
        // test runs against the same homeserver
        const timeToken = Date.now();
        const roomPlanetPrefix = `remote-planet-${timeToken}`;
        const roomXName = `${roomPlanetPrefix}-x`;
        const roomXId = await createTestRoom(hs2Client, {
          name: roomXName,
        });
        const roomYname = `${roomPlanetPrefix}-y`;
        const roomYId = await createTestRoom(hs2Client, {
          name: roomYname,
        });

        // (we set this here in case we timeout while waiting for the test rooms to
        // appear in the room directory)
        archiveUrl = matrixPublicArchiveURLCreator.roomDirectoryUrl({
          homeserver: HOMESERVER_URL_TO_PRETTY_NAME_MAP[testMatrixServerUrl2],
          searchTerm: roomPlanetPrefix,
        });

        // Try to avoid flakey tests where the homeserver hasn't added the rooms to the
        // room directory yet.
        await waitForResultsInHomeserverRoomDirectory({
          client: hs2Client,
          searchTerm: roomXName,
        });
        await waitForResultsInHomeserverRoomDirectory({
          client: hs2Client,
          searchTerm: roomYname,
        });

        const { data: roomDirectoryWithSearchPageHtml } = await fetchEndpointAsText(archiveUrl);
        const domWithSearch = parseHTML(roomDirectoryWithSearchPageHtml);

        // Make sure the `?homserver` is selected in the homeserver selector `<select>`
        const selectedHomeserverOptionElement = domWithSearch.document.querySelector(
          `[data-testid="homeserver-select"] option[selected]`
        );
        assert.strictEqual(
          selectedHomeserverOptionElement.getAttribute('value'),
          HOMESERVER_URL_TO_PRETTY_NAME_MAP[testMatrixServerUrl2]
        );

        const roomsOnPageWithSearch = [
          ...domWithSearch.document.querySelectorAll(`[data-testid="room-card"]`),
        ].map((roomCardEl) => {
          return roomCardEl.getAttribute('data-room-id');
        });

        // Assert that the rooms we searched for on remote hs2 are visible
        assert.deepStrictEqual(roomsOnPageWithSearch.sort(), [roomXId, roomYId].sort());
      });

      it('Safe search blocks nsfw rooms by default', async () => {
        const client = await getTestClientForHs(testMatrixServerUrl1);
        // This is just an extra room to fill out the room directory and make sure
        // that it does not appear when searching.
        await createTestRoom(client);

        // Then create some NSFW rooms we will find with search
        //
        // We use a `timeToken` so that we can namespace these rooms away from other
        // test runs against the same homeserver
        const timeToken = Date.now();
        const roomPlanetPrefix = `planet-${timeToken}`;
        const roomUranusName = `${roomPlanetPrefix}-uranus-nsfw`;
        const roomUranusId = await createTestRoom(client, {
          // NSFW in title
          name: roomUranusName,
        });
        const roomMarsName = `${roomPlanetPrefix}-mars`;
        const roomMarsId = await createTestRoom(client, {
          name: roomMarsName,
          // NSFW in room topic/description
          topic: 'Get your ass to mars (NSFW)',
        });

        // Browse the room directory searching the room directory for those NSFW rooms
        // (narrowing down results).
        //
        // (we set this here in case we timeout while waiting for the test rooms to
        // appear in the room directory)
        archiveUrl = matrixPublicArchiveURLCreator.roomDirectoryUrl({
          searchTerm: roomPlanetPrefix,
        });

        // Try to avoid flakey tests where the homeserver hasn't added the rooms to the
        // room directory yet. This isn't completely robust as it doesn't check that the
        // random room at the start is in the directory but should be good enough.
        await waitForResultsInHomeserverRoomDirectory({
          client,
          searchTerm: roomUranusName,
        });
        await waitForResultsInHomeserverRoomDirectory({
          client,
          searchTerm: roomMarsName,
        });

        const { data: roomDirectoryWithSearchPageHtml } = await fetchEndpointAsText(archiveUrl);
        const domWithSearch = parseHTML(roomDirectoryWithSearchPageHtml);

        const roomsCardsOnPageWithSearch = [
          ...domWithSearch.document.querySelectorAll(`[data-testid="room-card"]`),
        ];

        // Assert that the rooms we searched for are on the page
        const roomsIdsOnPageWithSearch = roomsCardsOnPageWithSearch.map((roomCardEl) => {
          return roomCardEl.getAttribute('data-room-id');
        });
        assert.deepStrictEqual(roomsIdsOnPageWithSearch.sort(), [roomUranusId, roomMarsId].sort());

        // Sanity check that safe search does something. Assert that it's *NOT* showing
        // the "nsfw" content
        roomsCardsOnPageWithSearch.forEach((roomCardEl) => {
          assert.match(
            roomCardEl.innerHTML,
            /^((?!nsfw).)*$/,
            `Expected safe search to block any nsfw rooms but saw "nsfw" in the room cards: ${roomCardEl.innerHTML.replaceAll(
              /nsfw/gi,
              (match) => {
                return chalk.yellow(match);
              }
            )}`
          );
        });
      });

      it('pagination is seamless', async () => {
        const client = await getTestClientForHs(testMatrixServerUrl1);
        // We use a `timeToken` so that we can namespace these rooms away from other
        // test runs against the same homeserver
        const timeToken = Date.now();
        const roomPlanetPrefix = `planet-${timeToken}`;

        // Fill up the room room directory with multiple pages of rooms
        const visibleRoomConfigurations = [];
        const roomsConfigurationsToCreate = [];
        for (let i = 0; i < 40; i++) {
          const roomCreateOptions = {
            name: `${roomPlanetPrefix}-room-${i}`,
          };

          // Sprinkle in some rooms every so often that should not appear in the room directory
          if (i % 3 === 0) {
            roomCreateOptions.name = `${roomPlanetPrefix}-room-not-world-readable-${i}`;
            roomCreateOptions.initial_state = [
              {
                type: 'm.room.history_visibility',
                state_key: '',
                content: {
                  history_visibility: 'joined',
                },
              },
              {
                type: 'm.room.topic',
                state_key: '',
                content: {
                  // Just a specific token we can search for in the DOM to make sure
                  // this room does not appear in the room directory.
                  topic: 'should-not-be-visible-in-archive-room-directory',
                },
              },
            ];
          } else {
            visibleRoomConfigurations.push(roomCreateOptions);
          }

          roomsConfigurationsToCreate.push(roomCreateOptions);
        }

        // Doing all of these create room requests in parallel is about 2x faster than
        // doing them serially and the room directory doesn't return the rooms in any
        // particular order so it doesn't make the test any more clear doing them
        // serially anyway.
        const createdRoomsIds = await Promise.all(
          roomsConfigurationsToCreate.map((roomCreateOptions) =>
            createTestRoom(client, roomCreateOptions)
          )
        );

        function roomIdToRoomName(expectedRoomId) {
          const roomIndex = createdRoomsIds.findIndex((roomId) => {
            return roomId === expectedRoomId;
          });
          assert(
            roomIndex > 0,
            `Expected to find expectedRoomId=${expectedRoomId} in the list of created rooms createdRoomsIds=${createdRoomsIds}`
          );

          const roomConfig = roomsConfigurationsToCreate[roomIndex];
          assert(
            roomConfig,
            `Expected to find room config for roomIndex=${roomIndex} in the list of roomsConfigurationsToCreate (length ${roomsConfigurationsToCreate.length})}`
          );

          return roomConfig.name;
        }

        async function checkRoomsOnPage(archiveUrl) {
          const { data: roomDirectoryWithSearchPageHtml } = await fetchEndpointAsText(archiveUrl);
          const dom = parseHTML(roomDirectoryWithSearchPageHtml);

          const roomsCardsOnPageWithSearch = [
            ...dom.document.querySelectorAll(`[data-testid="room-card"]`),
          ];

          const roomsIdsOnPage = roomsCardsOnPageWithSearch.map((roomCardEl) => {
            return roomCardEl.getAttribute('data-room-id');
          });

          // Sanity check that we don't see any non-world_readable rooms.
          roomsCardsOnPageWithSearch.forEach((roomCardEl) => {
            assert.match(
              roomCardEl.innerHTML,
              /^((?!should-not-be-visible-in-archive-room-directory).)*$/,
              `Expected not to see any non-world_readable rooms on the page but saw ${roomCardEl.getAttribute(
                'data-room-id'
              )} which has "should-not-be-visible-in-archive-room-directory" in the room topic`
            );
          });

          // Find the pagination buttons and grab the links to the previous and next pages
          const previousLinkElement = dom.document.querySelector(
            `[data-testid="room-directory-prev-link"]`
          );
          const nextLinkElement = dom.document.querySelector(
            `[data-testid="room-directory-next-link"]`
          );

          const previousPaginationLink = previousLinkElement.getAttribute('href');
          const nextPaginationLink = nextLinkElement.getAttribute('href');

          return {
            archiveUrl,
            roomsIdsOnPage,
            previousPaginationLink,
            nextPaginationLink,
          };
        }

        // Browse the room directory with the search prefix so we only see rooms
        // relevant to this test.
        //
        // (we set this here in case we timeout while waiting for the test rooms to
        // appear in the room directory)
        archiveUrl = matrixPublicArchiveURLCreator.roomDirectoryUrl({
          searchTerm: roomPlanetPrefix,
        });

        // Try to avoid flakey tests where the homeserver hasn't added the rooms
        // to the room directory yet. This isn't completely robust as it doesn't check
        // that all rooms are visible but it's better than nothing.
        await waitForResultsInHomeserverRoomDirectory({
          client,
          searchTerm: visibleRoomConfigurations[0].name,
        });
        await waitForResultsInHomeserverRoomDirectory({
          client,
          searchTerm: visibleRoomConfigurations[visibleRoomConfigurations.length - 1].name,
        });

        // Visit a sequence of pages using the pagination links: 1 -> 2 -> 3 -> 2 -> 1
        const firstPage = await checkRoomsOnPage(archiveUrl);
        const secondPage = await checkRoomsOnPage(firstPage.nextPaginationLink);
        const thirdPage = await checkRoomsOnPage(secondPage.nextPaginationLink);
        const backtrackSecondPage = await checkRoomsOnPage(thirdPage.previousPaginationLink);
        const backtrackFirstPage = await checkRoomsOnPage(
          backtrackSecondPage.previousPaginationLink
        );

        // Ensure that we saw all of the visible rooms paginating through the directory
        assert.deepStrictEqual(
          [...firstPage.roomsIdsOnPage, ...secondPage.roomsIdsOnPage, ...thirdPage.roomsIdsOnPage]
            .map(roomIdToRoomName)
            .sort(),
          visibleRoomConfigurations.map((roomConfig) => roomConfig.name).sort(),
          'Make sure we saw all visible rooms paginating through the directory'
        );

        // Ensure that we see the same rooms in the same order going backward that we saw going forward
        archiveUrl = backtrackSecondPage.archiveUrl;
        assert.deepStrictEqual(
          backtrackSecondPage.roomsIdsOnPage.map(roomIdToRoomName),
          secondPage.roomsIdsOnPage.map(roomIdToRoomName),
          'From the third page, going backward to second page should show the same rooms that we saw on the second page when going forward'
        );
        archiveUrl = backtrackFirstPage.archiveUrl;
        assert.deepStrictEqual(
          backtrackFirstPage.roomsIdsOnPage.map(roomIdToRoomName),
          firstPage.roomsIdsOnPage.map(roomIdToRoomName),
          'From the second page, going backward to first page should show the same rooms that we saw on first page when going forward'
        );
      });
    });

    describe('access controls', () => {
      it('not allowed to view private room even when the archiver user is in the room', async () => {
        const client = await getTestClientForHs(testMatrixServerUrl1);
        const roomId = await createTestRoom(client, {
          preset: 'private_chat',
          initial_state: [],
        });

        try {
          archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForRoom(roomId);
          await fetchEndpointAsText(archiveUrl);
          assert.fail(
            new TestError(
              'We expect the request to fail with a 403 since the archive should not be able to view a private room  but it succeeded'
            )
          );
        } catch (err) {
          if (err instanceof TestError) {
            throw err;
          }
          assert.strictEqual(
            err.response.status,
            403,
            `Expected err.response.status=${err?.response?.status} to be 403 but error was: ${err.stack}`
          );
        }
      });

      it('search engines allowed to index `world_readable` room', async () => {
        const client = await getTestClientForHs(testMatrixServerUrl1);
        const roomId = await createTestRoom(client);

        archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForRoom(roomId);
        const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);

        const dom = parseHTML(archivePageHtml);

        // Make sure the `<meta name="robots" ...>` tag does NOT exist on the
        // page telling search engines not to index it
        assert.strictEqual(dom.document.querySelector(`meta[name="robots"]`), null);
      });

      it('search engines not allowed to access public room with non-`world_readable` history visibility', async () => {
        const client = await getTestClientForHs(testMatrixServerUrl1);
        const roomId = await createTestRoom(client, {
          // Set as `shared` since it's the next most permissive history visibility
          // after `world_readable` but still not allowed to be accesible in the
          // archive.
          initial_state: [
            {
              type: 'm.room.history_visibility',
              state_key: '',
              content: {
                history_visibility: 'shared',
              },
            },
          ],
        });

        try {
          archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForRoom(roomId);
          await fetchEndpointAsText(archiveUrl);
          assert.fail(
            new TestError(
              'We expect the request to fail with a 403 since the archive should not be able to view a non-world_readable room but it succeeded'
            )
          );
        } catch (err) {
          if (err instanceof TestError) {
            throw err;
          }
          assert.strictEqual(
            err.response.status,
            403,
            `Expected err.response.status=${err?.response?.status} to be 403 but error was: ${err.stack}`
          );
        }
      });

      it('Configuring `stopSearchEngineIndexing` will stop search engine indexing', async () => {
        // Disable search engine indexing across the entire instance
        config.set('stopSearchEngineIndexing', true);

        const client = await getTestClientForHs(testMatrixServerUrl1);
        const roomId = await createTestRoom(client);

        archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForRoom(roomId);
        const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);

        const dom = parseHTML(archivePageHtml);

        // Make sure the `<meta name="robots" ...>` tag exists on the page
        // telling search engines not to index it
        assert.strictEqual(
          dom.document.querySelector(`meta[name="robots"]`)?.getAttribute('content'),
          'noindex, nofollow'
        );
      });
    });

    describe('redirects', () => {
      const controller = new AbortController();
      const { signal } = controller;

      // We have to use this sometimes over `fetch` because `fetch` does not allow us to
      // manually follow redirects and get the resultant URL, see
      // https://github.com/whatwg/fetch/issues/763
      function httpRequest(url) {
        return new Promise((resolve, reject) => {
          const req = http.request(url, { signal });
          req.on('response', (res) => {
            resolve(res);
          });
          req.on('error', (err) => {
            reject(err);
          });

          // This must be called for the request to actually go out
          req.end();
        });
      }

      after(() => {
        // Abort any in-flight request
        controller.abort();
      });

      describe('general', () => {
        let testRedirects = [];
        before(async () => {
          const client = await getTestClientForHs(testMatrixServerUrl1);
          const roomId = await createTestRoom(client);
          const roomIdWithoutSigil = roomId.replace(/^(#|!)/, '');
          const canonicalAlias = await getCanonicalAlias({ client, roomId });
          const canonicalAliasWithoutSigil = canonicalAlias.replace(/^(#|!)/, '');

          const nowDate = new Date();
          // Gives the date in YYYY/mm/dd format.
          // date.toISOString() -> 2022-02-16T23:20:04.709Z
          const urlDate = nowDate.toISOString().split('T')[0].replaceAll('-', '/');

          // Warn if it's close to the end of the UTC day. This test could be a flakey
          // and cause a failure if the room was created just before midnight (UTC) and
          // this timestamp comes after midnight. The redirect would want to go to the
          // day before when the latest event was created instead of the `nowDate` we
          // expected in the URL's.
          //
          // We could lookup the date of the latest event to use the `origin_server_ts`
          // from ourselves which may be less faff than this big warning but 🤷 - that's
          // kinda like making sure `/timestamp_to_event` works by using
          // `/timestamp_to_event`.
          if (roundUpTimestampToUtcDay(nowDate) - nowDate.getTime() < 30 * 1000 /* 30 seconds */) {
            // eslint-disable-next-line no-console
            console.warn(
              `Test is being run at the end of the UTC day. This could result in a flakey ` +
                `failure where the room was created before midnight (UTC) but the \`nowDate\` ` +
                `was after midnight meaning our expected URL's would be a day ahead. Since ` +
                `this is an e2e test we can't control the date/time exactly.`
            );
          }

          testRedirects.push(
            ...[
              {
                description:
                  'Visiting via a room ID will keep the URL as a room ID (avoid the canonical alias taking precedence)',
                from: urlJoin(basePath, `/roomid/${roomIdWithoutSigil}`),
                to: urlJoin(basePath, `/roomid/${roomIdWithoutSigil}/date/${urlDate}`),
              },
              {
                description: 'Visiting via a room alias will keep the URL as a room alias',
                from: urlJoin(basePath, `/r/${canonicalAliasWithoutSigil}`),
                to: urlJoin(basePath, `/r/${canonicalAliasWithoutSigil}/date/${urlDate}`),
              },
              {
                description:
                  'Removes the `?via` query parameter after joining from hitting the first endpoint (via parameter only necessary for room IDs)',
                from: urlJoin(
                  basePath,
                  `/roomid/${roomIdWithoutSigil}?via=${HOMESERVER_URL_TO_PRETTY_NAME_MAP[testMatrixServerUrl1]}`
                ),
                to: urlJoin(basePath, `/roomid/${roomIdWithoutSigil}/date/${urlDate}`),
              },
            ]
          );
        });

        it('redirects people to the correct place (see internal test matrix)', async () => {
          assert(testRedirects.length > 0, 'Expected more than 0 redirects to be tested');

          for (const testRedirect of testRedirects) {
            const res = await httpRequest(testRedirect.from);

            // This should be a temporary redirect because the latest date will change
            // as new events are sent for example.
            assert.strictEqual(res.statusCode, 302, 'We expected a 302 temporary redirect');
            // Make sure it redirected to the right location
            assert.strictEqual(res.headers.location, testRedirect.to, testRedirect.description);
          }
        });
      });

      describe('fix honest mistakes and redirect to the correct place', () => {
        let testRedirects = [];
        before(async () => {
          const client = await getTestClientForHs(testMatrixServerUrl1);
          const roomId = await createTestRoom(client);
          const roomIdWithoutSigil = roomId.replace(/^(#|!)/, '');
          const canonicalAlias = await getCanonicalAlias({ client, roomId });
          const canonicalAliasWithoutSigil = canonicalAlias.replace(/^(#|!)/, '');

          testRedirects.push(
            ...[
              {
                description: 'Using a room ID with a prefix sigil (pasting a room ID)',
                from: urlJoin(basePath, `/roomid/${roomId}`),
                to: urlJoin(basePath, `/roomid/${roomIdWithoutSigil}`),
              },
              {
                description: 'Using a room ID with a prefix sigil with extra path after',
                from: urlJoin(basePath, `/roomid/${roomId}/date/2022/09/20?via=my.synapse.server`),
                to: urlJoin(
                  basePath,
                  `/roomid/${roomIdWithoutSigil}/date/2022/09/20?via=my.synapse.server`
                ),
              },
              {
                description: 'Pasting a room ID with a prefix sigil after the domain root',
                from: urlJoin(basePath, `/${roomId}`),
                to: urlJoin(basePath, `/roomid/${roomIdWithoutSigil}`),
              },
              {
                description: 'URI encoded room ID',
                from: urlJoin(basePath, `/${encodeURIComponent(roomId)}`),
                to: urlJoin(basePath, `/roomid/${roomIdWithoutSigil}`),
              },
              {
                description: 'URI encoded canonical alias',
                from: urlJoin(basePath, `/${encodeURIComponent(canonicalAlias)}`),
                to: urlJoin(basePath, `/r/${canonicalAliasWithoutSigil}`),
              },
              {
                description:
                  'URI encoded canonical alias but on a visiting `/roomid/xxx` will redirect to alias `/r/xxx`',
                from: urlJoin(basePath, `/roomid/${encodeURIComponent(canonicalAlias)}`),
                to: urlJoin(basePath, `/r/${canonicalAliasWithoutSigil}`),
              },
            ]
          );
        });

        it('redirects people to the correct place (see internal test matrix)', async () => {
          assert(testRedirects.length > 0, 'Expected more than 0 redirects to be tested');

          for (const testRedirect of testRedirects) {
            const res = await httpRequest(testRedirect.from);

            assert.strictEqual(
              res.statusCode,
              301,
              'We expected a 301 permanent redirect for mistakes'
            );
            // Make sure it redirected to the right location
            assert.strictEqual(res.headers.location, testRedirect.to, testRedirect.description);
          }
        });
      });
    });
  });
});
