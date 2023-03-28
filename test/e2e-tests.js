'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert');
const path = require('path');
const http = require('http');
const urlJoin = require('url-join');
const escapeStringRegexp = require('escape-string-regexp');
const { parseHTML } = require('linkedom');
const { readFile } = require('fs').promises;

const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');
const {
  fetchEndpointAsText,
  fetchEndpointAsJson,
  HTTPResponseError,
} = require('../server/lib/fetch-endpoint');
const config = require('../server/lib/config');
const {
  MS_LOOKUP,
  TIME_PRECISION_VALUES,
} = require('matrix-public-archive-shared/lib/reference-values');
const { ONE_DAY_IN_MS, ONE_HOUR_IN_MS, ONE_MINUTE_IN_MS, ONE_SECOND_IN_MS } = MS_LOOKUP;

const {
  getTestClientForHs,
  createTestRoom,
  getCanonicalAlias,
  joinRoom,
  sendEvent,
  sendMessage,
  createMessagesInRoom,
  updateProfile,
  uploadContent,
} = require('./lib/client-utils');
const TestError = require('./lib/test-error');

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

function assertExpectedPrecisionAgainstUrl(expectedPrecision, url) {
  const urlObj = new URL(url, basePath);
  const urlPathname = urlObj.pathname;

  // First check the URL has the appropriate time precision
  if (expectedPrecision === null) {
    assert.doesNotMatch(
      urlPathname,
      /T[\d:]*?$/,
      `Expected the URL to *not* have any time precision but saw ${urlPathname}`
    );
  } else if (expectedPrecision === TIME_PRECISION_VALUES.minutes) {
    assert.match(urlPathname, /T\d\d:\d\d$/);
  } else if (expectedPrecision === TIME_PRECISION_VALUES.seconds) {
    assert.match(urlPathname, /T\d\d:\d\d:\d\d$/);
  } else {
    throw new Error(
      `\`expectedPrecision\` was an unexpected value ${expectedPrecision} which we don't know how to assert here`
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
          }") to be in room on hs2=${JSON.stringify(room2EventIds)}`
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
    afterEach(() => {
      if (interactive) {
        // eslint-disable-next-line no-console
        console.log('Interactive URL for test', archiveUrl);
      }

      // Reset `numMessagesSent` between tests so each test starts from the
      // beginning of the day and we don't run out of minutes in the day to send
      // messages in (we space messages out by a minute so the timestamp visibly
      // changes in the UI).
      numMessagesSent = 0;

      // Reset any custom modifications made for a particular test
      config.reset();
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

      it('redirects to last day with message history', async () => {
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

        // Visit `/:roomIdOrAlias` and expect to be redirected to the last day with events
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

      it('shows no events summary when no messages at or before the given day', async () => {
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

      describe('Too many messages (over `archiveMessageLimit`)', () => {
        const tooManyMessagesTestCases = [
          {
            durationLabel: 'day',
            durationMs: ONE_DAY_IN_MS,
            timeSliceLabel: 'hours',
            timeSliceMS: ONE_HOUR_IN_MS,
            // We would expect `TIME_PRECISION_VALUES.minutes` here but of the nature of
            // the end of the day and `toTimestamp`, it ends up being `T23:59:59` to not
            // lose any messages.
            expectedPrecision: TIME_PRECISION_VALUES.seconds,
          },
          {
            durationLabel: 'hour',
            durationMs: ONE_HOUR_IN_MS,
            timeSliceLabel: 'minutes',
            timeSliceMS: ONE_MINUTE_IN_MS,
            // We would expect `TIME_PRECISION_VALUES.minutes` here but of the nature of
            // the end of the day and `toTimestamp`, it ends up being `T23:59:59` to not
            // lose any messages.
            expectedPrecision: TIME_PRECISION_VALUES.seconds,
          },
          {
            durationLabel: 'minute',
            durationMs: ONE_MINUTE_IN_MS,
            timeSliceLabel: 'seconds',
            timeSliceMS: ONE_SECOND_IN_MS,
            expectedPrecision: TIME_PRECISION_VALUES.seconds,
          },
          {
            // We currently do not support when there are too many messages within a second.
            durationLabel: 'second',
            durationMs: ONE_SECOND_IN_MS,
            timeSliceLabel: '<no-small-enough-time-slice-available-for-one-ms>',
            timeSliceMS: 1,
            failBecauseTooManyMessages: true,
          },
        ];

        tooManyMessagesTestCases.forEach((testCase) => {
          // It's acceptable to have messages be from surrounding days over the limit. But
          // if all 500 messages (for example) are from the same day, we should be
          // redirected to a smaller time slice range to display.
          it(`will redirect to time slice of ${testCase.timeSliceLabel} when there are too many messages on the same ${testCase.durationLabel}`, async () => {
            const client = await getTestClientForHs(testMatrixServerUrl1);
            const roomId = await createTestRoom(client);
            // Set this low so we can easily create more than the limit
            config.set('archiveMessageLimit', 3);

            const utcMidnightOfArchiveDayTs = Date.UTC(
              archiveDate.getUTCFullYear(),
              archiveDate.getUTCMonth(),
              archiveDate.getUTCDate() + 1
            );
            // We minus 1 from UTC midnight to get be within the archive day
            const endofArchiveDayTs = utcMidnightOfArchiveDayTs - 1;

            // This is larger than the `archiveMessageLimit` we set
            const numTestMessages = 5;
            assert(
              numTestMessages > config.get('archiveMessageLimit'),
              'Expected number of messages we create to be larger than the `archiveMessageLimit`'
            );
            // Create more messages than the limit
            const { eventIds: eventIdsOnDay } = await createMessagesInRoom({
              client,
              roomId: roomId,
              numMessages: numTestMessages,
              prefix: 'events in room',
              timestamp: endofArchiveDayTs - numTestMessages * testCase.timeSliceMS,
              // If we create each message every timeSlice then we can gurantee that we
              // will create less than the duration but not all within the slice to
              // trigger too many in the slice. i.e. sending a message every hour for 5
              // hours, is less than the 24 hour day but doesn't overflow the
              // `archiveMessageLimit` for the hour slice.
              increment: testCase.timeSliceMS,
            });

            archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, archiveDate);

            if (testCase.failBecauseTooManyMessages) {
              try {
                const { res } = await fetchEndpointAsText(archiveUrl);
                assert.fail(
                  `Expected fetch to throw error because it's a 501 "Not implemented" response but it returned ${res.status}`
                );
              } catch (err) {
                if (err instanceof HTTPResponseError) {
                  assert.match(err.message, /Too many messages were sent all within a second/);
                } else {
                  throw err;
                }
              }
            } else {
              const { res, data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);

              // First check the URL has the appropriate time precision
              assertExpectedPrecisionAgainstUrl(testCase.expectedPrecision, res.url);

              const dom = parseHTML(archivePageHtml);

              // Make sure the messages are displayed. 4 messages shown since the
              // `archiveMessageLimit` is 3 and we display 1 more than that to check
              // overflow
              const expectedEventIdsToBeDisplayed = eventIdsOnDay.slice(-4);
              assert.deepStrictEqual(
                // eslint-disable-next-line max-nested-callbacks
                expectedEventIdsToBeDisplayed.map((eventId) => {
                  return dom.document
                    .querySelector(`[data-event-id="${eventId}"]`)
                    ?.getAttribute('data-event-id');
                }),
                expectedEventIdsToBeDisplayed
              );
            }
          });
        });

        it(`will not redirect to time slice when there are too many messages from surrounding days`, async () => {
          const client = await getTestClientForHs(testMatrixServerUrl1);
          const roomId = await createTestRoom(client);
          // Set this low so we can easily create more than the limit
          config.set('archiveMessageLimit', 3);

          // Create more messages than the limit on a previous day
          const previousArchiveDate = new Date(Date.UTC(2022, 0, 2));
          assert(
            previousArchiveDate < archiveDate,
            `The previousArchiveDate=${previousArchiveDate} should be before the archiveDate=${archiveDate}`
          );
          const { eventIds: surroundEventIds } = await createMessagesInRoom({
            client,
            roomId: roomId,
            numMessages: 2,
            prefix: 'events in room',
            timestamp: previousArchiveDate.getTime(),
          });

          // Create more messages than the limit
          const { eventIds: eventIdsOnDay } = await createMessagesInRoom({
            client,
            roomId: roomId,
            numMessages: 2,
            prefix: 'events in room',
            timestamp: archiveDate.getTime(),
          });

          archiveUrl = matrixPublicArchiveURLCreator.archiveUrlForDate(roomId, archiveDate);
          const { data: archivePageHtml } = await fetchEndpointAsText(archiveUrl);

          const dom = parseHTML(archivePageHtml);

          // Make sure the messages are displayed
          const expectedEventIdsToBeDisplayed = [].concat(surroundEventIds).concat(eventIdsOnDay);
          assert.deepStrictEqual(
            expectedEventIdsToBeDisplayed.map((eventId) => {
              return dom.document
                .querySelector(`[data-event-id="${eventId}"]`)
                ?.getAttribute('data-event-id');
            }),
            expectedEventIdsToBeDisplayed
          );
        });
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

      describe('Jump forwards and backwards', () => {
        const jumpTestCases = [
          {
            // Test to make sure we can jump from the 1st page to the 2nd page forwards.
            //
            // In order to jump from the 1st page to the 2nd, we first jump forward 4
            // messages, then back-track to the first date boundary which is day3. We do
            // this so that we don't start from day4 backwards which would miss messages
            // because there are more than 5 messages in between day4 and day2.
            //
            // Even though there is overlap between the pages, our scroll continues from
            // the event where the 1st page starts.
            //
            // 1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12
            // [day1       ]     [day2       ]     [day3       ]     [day4          ]
            //       [1st page               ]
            //                               |--jump-fwd-4-messages-->|
            //                         [2nd page               ]
            testName: 'can jump forward to the next activity',
            // The page limit is 4 but each page will show 5 messages because we
            // fetch one extra to determine overflow.
            archiveMessageLimit: 4,
            // Create enough surround messages on previous days that overflow the page
            // limit but don't overflow the limit on a single day basis. We create 4
            // days of messages so we can see a seamless continuation from page1 to
            // page2.
            dayAndMessageStructure: [3, 3, 3, 3],
            startUrlDate: '2022/01/02',
            page1: {
              urlDate: '2022/01/02',
              // (end of day2 backwards)
              events: [
                // Some of day1
                'day1.event1',
                'day1.event2',
                // All of day2
                'day2.event0',
                'day2.event1',
                'day2.event2',
              ],
              action: 'next',
            },
            page2: {
              // We expect the URL to look like `T23:59:59` because TODO
              //
              // XXX: Can't we simplify and have the URL without any time since `2022/01/03`
              // and `2022/01/03T23:59:59` are equivalent?
              urlDate: '2022/01/03T23:59:59',
              // Continuing from the first event of day3
              continueAtEvent: 'day3.event0',
              // (end of day3 backwards)
              events: [
                // Some of day2
                'day2.event1',
                'day2.event2',
                // All of day3
                'day3.event0',
                'day3.event1',
                'day3.event2',
              ],
              action: null,
            },
          },
          /* * /
          {
            // Test to make sure we can jump from the 1st page to the 2nd page forwards.
            // This test is just slightly different and jumps further into day4. Just a
            // slight variation to make sure it still does the correct thing.
            //
            // In order to jump from the 1st page to the 2nd, we first jump forward 4
            // messages, then back-track to the first date boundary which is day3. There
            // is exactly 5 messages between day4 and day2 which would be a perfect next
            // page but because we hit the middle of day4, we have no idea how many more
            // messages are in day4.
            //
            // Even though there is overlap between the pages, our scroll continues from
            // the event where the 1st page starts.
            //
            // 1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11
            // [day1       ]     [day2       ]     [day3 ]     [day4         ]
            //       [1st page               ]
            //                               |--jump-fwd-4-messages-->|
            //                   [2nd page               ]
            testName: 'can jump forward to the next activity2',
            dayAndMessageStructure: [3, 3, 2, 3],
            // The page limit is 4 but each page will show 5 messages because we
            // fetch one extra to determine overflow.
            archiveMessageLimit: 4,
            // Fetch messages for the 1st page (day2 backwards)
            page1Date: 'day2',
            // Assert that the first page contains 5 events
            expectedEventsOnPage1: [
              // Some of day1
              'day1.event1',
              'day1.event2',
              // All of day2
              'day2.event0',
              'day2.event1',
              'day2.event2',
            ],
            // Go to the next page
            action: 'next',
            // Continuing from the first event of day3
            expectedPage2ContinuationEvent: 'day3.event0',
            // Assert that the 2nd page contains 5 events
            expectedEventsOnPage2: [
              // All of day2
              'day2.event0',
              'day2.event1',
              'day2.event2',
              // All of day3
              'day3.event0',
              'day3.event1',
            ],
            // We expect the URL to look like `T23:59:59` because TODO
            //
            // XXX: Can't we simplify and have the URL without any time since `2022/11/17`
            // and `2022/11/17T23:59:59` are equivalent?
            expectedPage2Precision: TIME_PRECISION_VALUES.seconds,
          },
          {
            // Test to make sure we can jump from the 1st page to the 2nd page forwards
            // even when it exactly paginates to the last message of the next day.
            //
            // In order to jump from the 1st page to the 2nd, we first jump forward 3
            // messages, then back-track to the first date boundary which is still in
            // day3. We do this to ensure that you actually jump to the next day
            // (previous failed with naive flawed code).
            //
            // 1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12
            // [day1       ]     [day2       ]     [day3       ]     [day4          ]
            //             [1st page         ]
            //                               |-jump-fwd-3-msg->|
            //                         [2nd page         ]
            testName:
              'can jump forward to the next activity even when it only goes to the next day',
            dayAndMessageStructure: [3, 3, 3, 3],
            // The page limit is 3 but each page will show 4 messages because we
            // fetch one extra to determine overflow.
            archiveMessageLimit: 3,
            // Fetch messages for the 1st page (day2 backwards)
            page1Date: 'day2',
            // Assert that the first page contains 4 events
            expectedEventsOnPage1: [
              // Some of day1
              'day1.event2',
              // All of day2
              'day2.event0',
              'day2.event1',
              'day2.event2',
            ],
            // Go to the next page
            action: 'next',
            // Continuing from the first event of day3
            expectedPage2ContinuationEvent: 'day3.event0',
            // Assert that the 2nd page contains 4 events
            expectedEventsOnPage2: [
              // Some of day2
              'day2.event1',
              'day2.event2',
              // All of day3
              'day3.event0',
              'day3.event1',
            ],
            // We expect the URL to look like `T03:00` because we're rendering part way
            // through day3 and while we could get away with just hour precision, the
            // default precision has hours and minutes.
            expectedPage2Precision: TIME_PRECISION_VALUES.minutes,
          },
          {
            // Test to make sure we can jump from the 1st page to the 2nd page backwards
            //
            // The 2nd page continues from the *day* with the closest event backwards
            // from the 1st page (event4 on day2). Even though there is overlap between
            // the pages, our scroll continues from the event where the 1st page starts.
            //
            // 1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12
            // [day1       ]     [day2       ]     [day3       ]     [day4          ]
            //                         [1st page               ]
            //       [2nd page               ]
            testName: 'can jump backward to the previous activity',
            dayAndMessageStructure: [3, 3, 3, 3],
            // The page limit is 4 but each page will show 5 messages because we
            // fetch one extra to determine overflow.
            archiveMessageLimit: 4,
            // Fetch messages for the 1st page (day 3 backwards)
            page1Date: 'day3',
            // Assert that the first page contains 4 events
            expectedEventsOnPage1: [
              // Some of day2
              'day2.event1',
              'day2.event2',
              // All of day3
              'day3.event0',
              'day3.event1',
              'day3.event2',
            ],
            // Go to the previous page
            action: 'previous',
            // Continuing from the first event of day2
            expectedPage2ContinuationEvent: 'day2.event0',
            // Assert that the 2nd page contains 4 events
            expectedEventsOnPage2: [
              // Some of day1
              'day1.event1',
              'day1.event2',
              // All of day2
              'day2.event0',
              'day2.event1',
              'day2.event2',
            ],
            // We expect the URL to have no time slice
            expectedPage2Precision: null,
          },
          {
            // Test to make sure we can jump from the 1st page to the 2nd page forwards
            // across many quiet days without losing any messages in between.
            //
            // 1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14 <-- 15 <-- 16 <-- 17 <-- 18 <-- 19 <-- 20 <-- 21
            // [day1       ]     [day2       ]     [day3       ]     [day4          ]     [day5   ]     [day6   ]     [day7    ]    [day8          ]
            //                   [1st page                                          ]
            //                                                                      |------------------jump-fwd-8-msg---------------------->|
            //                                                       [2nd page                                                 ]
            testName: 'can jump forward over many days without losing any messages in a gap',
            dayAndMessageStructure: [3, 3, 3, 3, 2, 2, 2, 3],
            // The page limit is 8 but each page will show 9 messages because we
            // fetch one extra to determine overflow.
            archiveMessageLimit: 8,
            // Fetch messages for the 1st page (day4 backwards)
            page1Date: 'day4',
            // Assert that the 1st page contains 9 events
            expectedEventsOnPage1: [
              // All of day2
              'day2.event0',
              'day2.event1',
              'day2.event2',
              // All of day3
              'day3.event0',
              'day3.event1',
              'day3.event2',
              // All of day4
              'day4.event0',
              'day4.event1',
              'day4.event2',
            ],
            // Go to the next page
            action: 'next',
            // Continuing from the first event of day5
            expectedPage2ContinuationEvent: 'day5.event0',
            // Assert that the 2nd page contains 9 events
            expectedEventsOnPage2: [
              // All of day4
              'day4.event0',
              'day4.event1',
              'day4.event2',
              // All of day5
              'day5.event0',
              'day5.event1',
              // All of day6
              'day6.event0',
              'day6.event1',
              // All of day7
              'day7.event0',
              'day7.event1',
            ],
            // We expect the URL to look like `T23:59:59` because TODO
            //
            // XXX: Can't we simplify and have the URL without any time since `2022/11/17`
            // and `2022/11/17T23:59:59` are equivalent?
            expectedPage2Precision: TIME_PRECISION_VALUES.seconds,
          },
          {
            // Test to make sure we can jump from the 1st page to the 2nd page backwards
            // and show many days without much activity so they all fit on one page.
            //
            // The 2nd page continues from the *day* with the closest event backwards
            // from the 1st page (event4 on day2). Even though there is overlap between the pages, our
            // scroll continues from the event where the 1st page starts.
            //
            // 1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14 <-- 15 <-- 16 <-- 17 <-- 18 <-- 19 <-- 20 <-- 21
            // [day1 ]     [day2 ]     [day3 ]     [day4 ]     [day5   ]    [day6   ]     [day7          ]     [day8          ]     [day9          ]
            //                                                                            [1st page                                                ]
            //                   [2nd page                                          ]
            testName: 'can jump backward to the previous activity with many small quiet days',
            dayAndMessageStructure: [2, 2, 2, 2, 2, 2, 3, 3, 3],
            // The page limit is 8 but each page will show 9 messages because we
            // fetch one extra to determine overflow.
            archiveMessageLimit: 8,
            // Fetch messages for the 1st page (day9 backwards)
            page1Date: 'day9',
            // Assert that the first page contains 9 events
            expectedEventsOnPage1: [
              // All of day7
              'day7.event0',
              'day7.event1',
              'day7.event2',
              // All of day8
              'day8.event0',
              'day8.event1',
              'day8.event2',
              // All of day9
              'day9.event0',
              'day9.event1',
              'day9.event2',
            ],
            // Go to the previous page
            action: 'previous',
            // Continuing from the last event of day6
            expectedPage2ContinuationEvent: 'day6.event1',
            // Assert that the 2nd page contains 9 events
            expectedEventsOnPage2: [
              // Some of day2
              'day2.event1',
              // All of day3
              'day3.event0',
              'day3.event1',
              // All of day4
              'day4.event0',
              'day4.event1',
              // All of day5
              'day5.event0',
              'day5.event1',
              // All of day6
              'day6.event0',
              'day6.event1',
            ],
            // We expect the URL to have no time slice
            expectedPage2Precision: null,
          },
          {
            // Test to make sure we can jump forwards from the 1st page to the 2nd page
            // with too many messages to display on a single day.
            //
            // We jump forward 4 messages (`archiveMessageLimit`), then back-track one
            // hour which starts off at event9 and render the page with 5 messages
            // because we fetch one more than `archiveMessageLimit` to determine
            // overflow.
            //
            // 1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14 <-- 15
            // [day1       ]     [day2       ]     [day3                            ]     [day4          ]
            //       [1st page               ]
            //                               |--jump-fwd-4-messages-->|
            //                         [2nd page               ]
            testName: 'can jump forward to the next activity and land in too many messages',
            dayAndMessageStructure: [3, 3, 6, 3],
            // The page limit is 4 but each page will show 5 messages because we
            // fetch one extra to determine overflow.
            archiveMessageLimit: 4,
            // Fetch messages for the 1st page (day2 backwards)
            page1Date: 'day2',
            // Assert that the first page contains 5 events
            expectedEventsOnPage1: [
              // Some of day 1
              'day1.event1',
              'day1.event2',
              // All of day 2
              'day2.event0',
              'day2.event1',
              'day2.event2',
            ],
            // Go to the next page
            action: 'next',
            // Continuing from the first event of day3
            expectedPage2ContinuationEvent: 'day3.event0',
            // Assert that the 2nd page contains 5 events
            expectedEventsOnPage2: [
              // Some of day 2
              'day2.event1',
              'day2.event2',
              // Some of day 3
              'day3.event0',
              'day3.event1',
              'day3.event2',
            ],
            // We expect the URL to look like `T04:00` because we're rendering part way
            // through day3 and while we could get away with just hour precision, the
            // default precision has hours and minutes.
            expectedPage2Precision: TIME_PRECISION_VALUES.minutes,
          },
          {
            // Test to make sure we can jump backwards from the 1st page to the 2nd page
            // with too many messages to display on a single day.
            //
            // The 2nd page continues from the *day* with the closest event backwards
            // from the 1st page (event9 on day2).
            //
            // 1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
            // [day1       ]     [day2                         ]     [day3          ]     [day4   ]
            //                                                       [1st page                    ]
            //                         [2nd page               ]
            testName: 'can jump backward to the previous activity and land in too many messages',
            dayAndMessageStructure: [3, 6, 3, 2],
            // The page limit is 4 but each page will show 5 messages because we
            // fetch one extra to determine overflow.
            archiveMessageLimit: 4,
            // Fetch messages for the 1st page (day4 backwards)
            page1Date: 'day4',
            // Assert that the first page contains 5 events
            expectedEventsOnPage1: [
              // All of day 3
              'day3.event0',
              'day3.event1',
              'day3.event2',
              // All of day 4
              'day4.event0',
              'day4.event1',
            ],
            // Go to the previous page
            action: 'previous',
            // Continuing from the last event of day2
            expectedPage2ContinuationEvent: 'day2.event5',
            // Assert that the 2nd page contains 5 events
            expectedEventsOnPage2: [
              // Most of day 2
              'day2.event1',
              'day2.event2',
              'day2.event3',
              'day2.event4',
              'day2.event5',
            ],
            // We expect the URL to look like `T23:59:59` because TODO
            //
            // XXX: Can't we simplify and have the URL without any time since `2022/11/17`
            // and `2022/11/17T23:59:59` are equivalent?
            expectedPage2Precision: TIME_PRECISION_VALUES.seconds,
          },
          {
            // We jump forward 4 messages (`archiveMessageLimit`), then back-track one
            // hour which starst off at event11 and render the page with 5 messages
            // because we fetch one more than `archiveMessageLimit` to determine
            // overflow.
            //
            // 1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
            // [day1 ]     [day2                         ]     [day3                              ]
            //                   [1st page               ]
            //                                           |---jump-fwd-4-messages--->|
            //                                     [2nd page                 ]
            testName:
              'can jump forward from one day with too many messages into the next day with too many messages',
            dayAndMessageStructure: [2, 6, 6],
            // The page limit is 4 but each page will show 5 messages because we
            // fetch one extra to determine overflow.
            archiveMessageLimit: 4,
            // Fetch messages for the 1st page (day2 backwards)
            page1Date: 'day2',
            // Assert that the first page contains 5 events
            expectedEventsOnPage1: [
              // Some of day 2
              'day2.event1',
              'day2.event2',
              'day2.event3',
              'day2.event4',
              'day2.event5',
            ],
            // Go to the next page
            action: 'next',
            // Continuing from the first event of day3
            expectedPage2ContinuationEvent: 'day3.event0',
            // Assert that the 2nd page contains 5 events
            expectedEventsOnPage2: [
              // Some of day 2
              'day2.event4',
              'day2.event5',
              // Some of day 3
              'day3.event0',
              'day3.event1',
              'day3.event2',
            ],
            // We expect the URL to look like `T04:00` because we're rendering part way
            // through day3 and while we could get away with just hour precision, the
            // default precision has hours and minutes.
            expectedPage2Precision: TIME_PRECISION_VALUES.minutes,
          },
          {
            // TODO: This test currently fails but I think it's correct (our implementation is wrong)
            //
            // The 2nd page continues from the *day* with the closest event backwards
            // from the 1st page (event9 on day2).
            //
            // 1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12 <-- 13 <-- 14
            // [day1 ]     [day2                         ]     [day3                              ]
            //                                                       [1st page                    ]
            //                         [2nd page               ]
            testName:
              'can jump backward from one day with too many messages into the previous day with too many messages',
            dayAndMessageStructure: [2, 6, 6],
            // The page limit is 4 but each page will show 5 messages because we
            // fetch one extra to determine overflow.
            archiveMessageLimit: 4,
            // Fetch messages for the 1st page (day3 backwards)
            page1Date: 'day3',
            // Assert that the first page contains 5 events
            expectedEventsOnPage1: [
              // Some of day 3
              'day3.event1',
              'day3.event2',
              'day3.event3',
              'day3.event4',
              'day3.event5',
            ],
            // Go to the previous page
            action: 'previous',
            // Continuing from the second event of day3
            expectedPage2ContinuationEvent: 'day3.event0',
            // Assert that the 2nd page contains 5 events
            expectedEventsOnPage2: [
              // Some of day 2
              'day2.event2',
              'day2.event3',
              'day2.event4',
              'day2.event5',
              // Some of day 3
              'day3.event0',
            ],
            // We expect the URL to look like `T01:01` because we're rendering part way
            // through day3 and while we could get away with just hour precision, the
            // default precision has hours and minutes.
            expectedPage2Precision: TIME_PRECISION_VALUES.minutes,
          },
          /* */
        ];

        jumpTestCases.forEach((testCase) => {
          // eslint-disable-next-line max-statements
          it(testCase.testName, async () => {
            // Setup
            // --------------------------------------
            // --------------------------------------
            const fancyIdentifierToEventMap = {};

            function convertFancyIdentifierListToDebugEventIds(fancyEventIdentifiers) {
              // eslint-disable-next-line max-nested-callbacks
              return fancyEventIdentifiers.map((fancyId) => {
                const eventId = fancyIdentifierToEventMap[fancyId];
                if (!eventId) {
                  throw new Error(
                    `Unable to find ${fancyId} in the fancyIdentifierToEventMap=${JSON.stringify(
                      fancyIdentifierToEventMap,
                      null,
                      2
                    )}`
                  );
                }
                return `${eventId} (${fancyId})`;
              });
            }

            function convertEventIdsToDebugEventIds(eventIds) {
              // eslint-disable-next-line max-nested-callbacks
              return eventIds.map((eventId) => {
                const [fancyId] =
                  Object.entries(fancyIdentifierToEventMap).find(
                    // eslint-disable-next-line max-nested-callbacks, no-unused-vars -- It's more clear to leave `fancyId` so we can see what we're destructuring from
                    ([fancyId, eventIdFromFancyMap]) => {
                      return eventIdFromFancyMap === eventId;
                    }
                  ) ?? [];
                if (!fancyId) {
                  throw new Error(
                    `Unable to find ${eventId} in the fancyIdentifierToEventMap=${JSON.stringify(
                      fancyIdentifierToEventMap,
                      null,
                      2
                    )}`
                  );
                }
                return `${eventId} (${fancyId})`;
              });
            }

            const client = await getTestClientForHs(testMatrixServerUrl1);
            const roomId = await createTestRoom(client);

            const dayIdentifierToDateMap = {};
            const numberOfDaysToConstruct = testCase.dayAndMessageStructure.length;
            for (let i = 0; i < numberOfDaysToConstruct; i++) {
              const dayNumber = i + 1;
              const numMessagesOnDay = testCase.dayAndMessageStructure[i];

              // The date should be just past midnight so we don't run into inclusive
              // bounds leaking messages from one day into another.
              const previousArchiveDate = new Date(Date.UTC(2022, 0, dayNumber, 1, 0, 0, 1));

              dayIdentifierToDateMap[`day${dayNumber}`] = previousArchiveDate;

              const { eventIds } = await createMessagesInRoom({
                client,
                roomId,
                numMessages: numMessagesOnDay,
                prefix: `day ${dayNumber} - events in room`,
                timestamp: previousArchiveDate.getTime(),
                // Just spread things out a bit so we don't run into time slice redirecting
                increment: ONE_HOUR_IN_MS,
              });
              // Make sure we created the same number of events as we expect
              assert.strictEqual(eventIds.length, numMessagesOnDay);

              // eslint-disable-next-line max-nested-callbacks
              eventIds.forEach((eventId, i) => {
                fancyIdentifierToEventMap[`day${dayNumber}.event${i}`] = eventId;
              });
            }

            // Now Test
            // --------------------------------------
            // --------------------------------------

            // Make sure the archive is configured as the test expects
            assert(
              Number.isInteger(testCase.archiveMessageLimit) && testCase.archiveMessageLimit > 0,
              `testCase.archiveMessageLimit=${testCase.archiveMessageLimit} must be an integer and greater than 0`
            );
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
            const startUrlDate = testCase.startUrlDate;
            assert(
              startUrlDate,
              `\`startUrlDate\` must be defined in your test case: ${JSON.stringify(
                testCase,
                null,
                2
              )}`
            );
            archiveUrl = `${matrixPublicArchiveURLCreator.archiveUrlForRoom(
              roomId
            )}/date/${startUrlDate}`;

            // Loop through all of the pages of the test and ensure expectations
            let alreadyEncounteredLastPage = false;
            for (const pageKey of pagesKeyList) {
              if (alreadyEncounteredLastPage) {
                assert.fail(
                  'We should not see any more pages after we already saw a page without an action ' +
                    `which signals the end of expecations. Encountered ${pageKey} in ${pagesKeyList} ` +
                    'after we already thought we were done'
                );
              }

              const pageTestMeta = testCase[pageKey];

              // Fetch the given page.
              const { data: archivePageHtml, res: pageRes } = await fetchEndpointAsText(archiveUrl);
              const pageDom = parseHTML(archivePageHtml);

              // Assert the correct time precision in the URL
              assert.match(pageRes.url, new RegExp(`/date/${pageTestMeta.urlDate}(\\?|$)`));

              // If provided, assert that it's a smooth continuation to more messages.
              // First by checking where the scroll is going to start from
              if (pageTestMeta.continueAtEvent) {
                const [expectedContinuationDebugEventId] =
                  convertFancyIdentifierListToDebugEventIds([pageTestMeta.continueAtEvent]);
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

              const eventIdsOnPage = [...pageDom.document.querySelectorAll(`[data-event-id]`)]
                // eslint-disable-next-line max-nested-callbacks
                .map((eventEl) => {
                  return eventEl.getAttribute('data-event-id');
                });

              // Assert that the page contains all expected events
              assert.deepEqual(
                convertEventIdsToDebugEventIds(eventIdsOnPage),
                convertFancyIdentifierListToDebugEventIds(pageTestMeta.events),
                `Events on ${pageKey} should be as expected`
              );

              // Follow the next activity link. Aka, fetch messages for the 2nd page
              let actionLinkSelector;
              if (pageTestMeta.action === 'next') {
                actionLinkSelector = '[data-testid="jump-to-next-activity-link"]';
              } else if (pageTestMeta.action === 'previous') {
                actionLinkSelector = '[data-testid="jump-to-previous-activity-link"]';
              } else if (pageTestMeta.action === null) {
                // No more pages to test ✅, move on
                alreadyEncounteredLastPage = true;
                continue;
              } else {
                throw new Error(
                  `Unexpected value for ${pageKey}.action=${pageTestMeta.action} that we don't know what to do with`
                );
              }
              const jumpToActivityLinkEl = pageDom.document.querySelector(actionLinkSelector);
              const jumpToActivityLinkHref = jumpToActivityLinkEl.getAttribute('href');
              // Move to the next iteration of the loop
              //
              // Set this for debugging if the test fails here
              archiveUrl = jumpToActivityLinkHref;
            }
          });
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
        const roomSaturnId = await createTestRoom(client, {
          name: `${roomPlanetPrefix}-saturn`,
        });
        const roomMarsId = await createTestRoom(client, {
          name: `${roomPlanetPrefix}-mars`,
        });

        // Browse the room directory without search to see many rooms
        archiveUrl = matrixPublicArchiveURLCreator.roomDirectoryUrl();
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
        const roomXId = await createTestRoom(hs2Client, {
          name: `${roomPlanetPrefix}-x`,
        });
        const roomYId = await createTestRoom(hs2Client, {
          name: `${roomPlanetPrefix}-y`,
        });

        archiveUrl = matrixPublicArchiveURLCreator.roomDirectoryUrl({
          homeserver: HOMESERVER_URL_TO_PRETTY_NAME_MAP[testMatrixServerUrl2],
          searchTerm: roomPlanetPrefix,
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

      it('search engines not allowed to index `public` room', async () => {
        const client = await getTestClientForHs(testMatrixServerUrl1);
        const roomId = await createTestRoom(client, {
          // The default options for the test rooms adds a
          // `m.room.history_visiblity` state event so we override that here so
          // it's only a public room.
          initial_state: [],
        });

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
          const utcMidnightOfNowDay = Date.UTC(
            nowDate.getUTCFullYear(),
            nowDate.getUTCMonth(),
            nowDate.getUTCDate() + 1
          );
          if (utcMidnightOfNowDay - nowDate.getTime() < 30 * 1000 /* 30 seconds */) {
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
