const assert = require('assert');

const {
  roundUpTimestampToUtcDay,
  roundUpTimestampToUtcHour,
  roundUpTimestampToUtcMinute,
  roundUpTimestampToUtcSecond,
  getUtcStartOfDayTs,
  getUtcStartOfHourTs,
  getUtcStartOfMinuteTs,
  getUtcStartOfSecondTs,
  areTimestampsFromSameUtcDay,
  areTimestampsFromSameUtcHour,
  areTimestampsFromSameUtcMinute,
  areTimestampsFromSameUtcSecond,
} = require('matrix-public-archive-shared/lib/timestamp-utilities');

describe('timestamp-utilities', () => {
  describe('roundUpTimestampToUtcX', () => {
    function testRoundUpFunction(roundUpFunctionToTest, testMeta) {
      it(`${new Date(testMeta.inputTs).toISOString()} -> ${new Date(
        testMeta.expectedTs
      ).toISOString()}`, () => {
        assert(testMeta.inputTs);
        assert(testMeta.expectedTs);
        const actualTs = roundUpFunctionToTest(testMeta.inputTs);
        assert.strictEqual(
          actualTs,
          testMeta.expectedTs,
          `Expected actualTs=${new Date(actualTs).toISOString()} to be expectedTs=${new Date(
            testMeta.expectedTs
          ).toISOString()}`
        );
      });
    }

    describe('roundUpTimestampToUtcDay', () => {
      [
        {
          inputTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T05:05:05.000Z').getTime(),
          expectedTs: new Date('2022-01-16T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T05:05:05.001Z').getTime(),
          expectedTs: new Date('2022-01-16T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T00:00:00.001Z').getTime(),
          expectedTs: new Date('2022-01-16T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T23:59:59.999Z').getTime(),
          expectedTs: new Date('2022-01-16T00:00:00.000Z').getTime(),
        },
      ].forEach((testMeta) => {
        testRoundUpFunction(roundUpTimestampToUtcDay, testMeta);
      });
    });

    describe('roundUpTimestampToUtcHour', () => {
      [
        {
          inputTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T05:05:05.000Z').getTime(),
          expectedTs: new Date('2022-01-15T06:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T05:05:05.001Z').getTime(),
          expectedTs: new Date('2022-01-15T06:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T00:00:00.001Z').getTime(),
          expectedTs: new Date('2022-01-15T01:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T23:59:59.999Z').getTime(),
          expectedTs: new Date('2022-01-16T00:00:00.000Z').getTime(),
        },
      ].forEach((testMeta) => {
        testRoundUpFunction(roundUpTimestampToUtcHour, testMeta);
      });
    });

    describe('roundUpTimestampToUtcMinute', () => {
      [
        {
          inputTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T05:05:05.000Z').getTime(),
          expectedTs: new Date('2022-01-15T05:06:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T05:05:05.001Z').getTime(),
          expectedTs: new Date('2022-01-15T05:06:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T00:00:00.001Z').getTime(),
          expectedTs: new Date('2022-01-15T00:01:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T23:59:59.999Z').getTime(),
          expectedTs: new Date('2022-01-16T00:00:00.000Z').getTime(),
        },
      ].forEach((testMeta) => {
        testRoundUpFunction(roundUpTimestampToUtcMinute, testMeta);
      });
    });

    describe('roundUpTimestampToUtcSecond', () => {
      [
        {
          inputTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T05:05:05.000Z').getTime(),
          expectedTs: new Date('2022-01-15T05:05:05.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T05:05:05.001Z').getTime(),
          expectedTs: new Date('2022-01-15T05:05:06.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T00:00:00.001Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:01.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T23:59:59.999Z').getTime(),
          expectedTs: new Date('2022-01-16T00:00:00.000Z').getTime(),
        },
      ].forEach((testMeta) => {
        testRoundUpFunction(roundUpTimestampToUtcSecond, testMeta);
      });
    });
  });

  describe('getUtcStartOfXTs', () => {
    function testGetUtcStartOfXFunction(getUtcStartOfXFunctionToTest, testMeta) {
      it(`${new Date(testMeta.inputTs).toISOString()} -> ${new Date(
        testMeta.expectedTs
      ).toISOString()}`, () => {
        assert(testMeta.inputTs);
        assert(testMeta.expectedTs);
        const actualTs = getUtcStartOfXFunctionToTest(testMeta.inputTs);
        assert.strictEqual(
          actualTs,
          testMeta.expectedTs,
          `Expected actualTs=${new Date(actualTs).toISOString()} to be expectedTs=${new Date(
            testMeta.expectedTs
          ).toISOString()}`
        );
      });
    }

    describe('getUtcStartOfDayTs', () => {
      [
        {
          inputTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T05:05:05.000Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T15:35:35.750Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T00:00:00.001Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T23:59:59.999Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
      ].forEach((testMeta) => {
        testGetUtcStartOfXFunction(getUtcStartOfDayTs, testMeta);
      });
    });

    describe('getUtcStartOfHourTs', () => {
      [
        {
          inputTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T05:05:05.000Z').getTime(),
          expectedTs: new Date('2022-01-15T05:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T15:35:35.750Z').getTime(),
          expectedTs: new Date('2022-01-15T15:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T00:00:00.001Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T23:59:59.999Z').getTime(),
          expectedTs: new Date('2022-01-15T23:00:00.000Z').getTime(),
        },
      ].forEach((testMeta) => {
        testGetUtcStartOfXFunction(getUtcStartOfHourTs, testMeta);
      });
    });

    describe('getUtcStartOfMinuteTs', () => {
      [
        {
          inputTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T05:05:05.000Z').getTime(),
          expectedTs: new Date('2022-01-15T05:05:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T15:35:35.750Z').getTime(),
          expectedTs: new Date('2022-01-15T15:35:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T00:00:00.001Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T23:59:59.999Z').getTime(),
          expectedTs: new Date('2022-01-15T23:59:00.000Z').getTime(),
        },
      ].forEach((testMeta) => {
        testGetUtcStartOfXFunction(getUtcStartOfMinuteTs, testMeta);
      });
    });

    describe('getUtcStartOfSecondTs', () => {
      [
        {
          inputTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T05:05:05.000Z').getTime(),
          expectedTs: new Date('2022-01-15T05:05:05.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T15:35:35.750Z').getTime(),
          expectedTs: new Date('2022-01-15T15:35:35.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T00:00:00.001Z').getTime(),
          expectedTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
        },
        {
          inputTs: new Date('2022-01-15T23:59:59.999Z').getTime(),
          expectedTs: new Date('2022-01-15T23:59:59.000Z').getTime(),
        },
      ].forEach((testMeta) => {
        testGetUtcStartOfXFunction(getUtcStartOfSecondTs, testMeta);
      });
    });
  });

  describe('areTimestampsFromSameUtcX', () => {
    function testAreTimestampsFromSameXFunction(areTimestampsFromSameXFunctionToTest, testMeta) {
      it(`${testMeta.description} -- A=${new Date(
        testMeta.inputATs
      ).toISOString()} and B=${new Date(testMeta.inputBTs).toISOString()} should${
        testMeta.expected ? '' : ' *NOT*'
      } be from the same day`, () => {
        assert(testMeta.inputATs);
        assert(testMeta.inputBTs);
        assert(testMeta.expected !== undefined);

        const actualValue = areTimestampsFromSameXFunctionToTest(
          testMeta.inputATs,
          testMeta.inputBTs
        );
        assert.strictEqual(actualValue, testMeta.expected);
      });
    }

    describe('areTimestampsFromSameUtcDay', () => {
      [
        {
          description: 'same timestamp is considered from the same day',
          inputATs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          inputBTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expected: true,
        },
        {
          description: 'timestamp from same day',
          inputATs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          inputBTs: new Date('2022-01-15T05:05:05.005Z').getTime(),
          expected: true,
        },
        {
          description: 'timestamp at extremes of the day',
          inputATs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          inputBTs: new Date('2022-01-15T23:59:59.999Z').getTime(),
          expected: true,
        },
        {
          description:
            'timestamp that is only 1ms from the other but from another day should *NOT* be considered from the same day',
          inputATs: new Date('2022-01-14T23:59:59.999Z').getTime(),
          inputBTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expected: false,
        },
        {
          description:
            'timestamp that is only 1ms from the other but from another day should *NOT* be considered from the same day (A and B switched)',
          inputATs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          inputBTs: new Date('2022-01-14T23:59:59.999Z').getTime(),
          expected: false,
        },
        {
          description:
            'timestamp that is less than a day apart but from different days should *NOT* be considered from the same day',
          inputATs: new Date('2022-01-15T04:00:00.000Z').getTime(),
          inputBTs: new Date('2022-01-14T20:00:00.000Z').getTime(),
          expected: false,
        },
      ].forEach((testMeta) => {
        testAreTimestampsFromSameXFunction(areTimestampsFromSameUtcDay, testMeta);
      });
    });

    describe('areTimestampsFromSameUtcHour', () => {
      [
        {
          description: 'same timestamp is considered from the same hour',
          inputATs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          inputBTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expected: true,
        },
        {
          description: 'timestamp from same hour',
          inputATs: new Date('2022-01-15T05:05:05.005Z').getTime(),
          inputBTs: new Date('2022-01-15T05:35:35.035Z').getTime(),
          expected: true,
        },
        {
          description: 'timestamp at extremes of the hour',
          inputATs: new Date('2022-01-15T23:00:00.000Z').getTime(),
          inputBTs: new Date('2022-01-15T23:59:59.999Z').getTime(),
          expected: true,
        },
        {
          description:
            'timestamp that is only 1ms from the other but from another day should *NOT* be considered from the same hour',
          inputATs: new Date('2022-01-14T23:59:59.999Z').getTime(),
          inputBTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expected: false,
        },
        {
          description:
            'timestamp that is only 1ms from the other but from another day should *NOT* be considered from the same hour (A and B switched)',
          inputATs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          inputBTs: new Date('2022-01-14T23:59:59.999Z').getTime(),
          expected: false,
        },
        {
          description:
            'timestamp that is only 1ms from the other but from another hour should *NOT* be considered from the same hour (A and B switched)',
          inputATs: new Date('2022-01-14T05:59:59.999Z').getTime(),
          inputBTs: new Date('2022-01-15T06:00:00.000Z').getTime(),
          expected: false,
        },
        {
          description:
            'timestamp that is less than a hour apart but from different hours should *NOT* be considered from the same hour',
          inputATs: new Date('2022-01-15T04:45:00.000Z').getTime(),
          inputBTs: new Date('2022-01-15T05:10:00.000Z').getTime(),
          expected: false,
        },
      ].forEach((testMeta) => {
        testAreTimestampsFromSameXFunction(areTimestampsFromSameUtcHour, testMeta);
      });
    });

    describe('areTimestampsFromSameUtcMinute', () => {
      [
        {
          description: 'same timestamp is considered from the same minute',
          inputATs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          inputBTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expected: true,
        },
        {
          description: 'timestamp from same minute',
          inputATs: new Date('2022-01-15T05:05:05.005Z').getTime(),
          inputBTs: new Date('2022-01-15T05:05:35.035Z').getTime(),
          expected: true,
        },
        {
          description: 'timestamp at extremes of the minute',
          inputATs: new Date('2022-01-15T23:59:00.000Z').getTime(),
          inputBTs: new Date('2022-01-15T23:59:59.999Z').getTime(),
          expected: true,
        },
        {
          description:
            'timestamp that is only 1ms from the other but from another day should *NOT* be considered from the same minute',
          inputATs: new Date('2022-01-14T23:59:59.999Z').getTime(),
          inputBTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expected: false,
        },
        {
          description:
            'timestamp that is only 1ms from the other but from another day should *NOT* be considered from the same minute (A and B switched)',
          inputATs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          inputBTs: new Date('2022-01-14T23:59:59.999Z').getTime(),
          expected: false,
        },
        {
          description:
            'timestamp that is only 1ms from the other but from another minute should *NOT* be considered from the same minute (A and B switched)',
          inputATs: new Date('2022-01-14T05:05:59.999Z').getTime(),
          inputBTs: new Date('2022-01-15T05:06:00.000Z').getTime(),
          expected: false,
        },
        {
          description:
            'timestamp that is less than a minute apart but from different minutes should *NOT* be considered from the same minute',
          inputATs: new Date('2022-01-15T04:45:45.000Z').getTime(),
          inputBTs: new Date('2022-01-15T05:46:10.000Z').getTime(),
          expected: false,
        },
      ].forEach((testMeta) => {
        testAreTimestampsFromSameXFunction(areTimestampsFromSameUtcMinute, testMeta);
      });
    });

    describe('areTimestampsFromSameUtcSecond', () => {
      [
        {
          description: 'same timestamp is considered from the same second',
          inputATs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          inputBTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expected: true,
        },
        {
          description: 'timestamp from same second',
          inputATs: new Date('2022-01-15T05:05:35.005Z').getTime(),
          inputBTs: new Date('2022-01-15T05:05:35.035Z').getTime(),
          expected: true,
        },
        {
          description: 'timestamp at extremes of the second',
          inputATs: new Date('2022-01-15T23:59:59.000Z').getTime(),
          inputBTs: new Date('2022-01-15T23:59:59.999Z').getTime(),
          expected: true,
        },
        {
          description:
            'timestamp that is only 1ms from the other but from another day should *NOT* be considered from the same second',
          inputATs: new Date('2022-01-14T23:59:59.999Z').getTime(),
          inputBTs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          expected: false,
        },
        {
          description:
            'timestamp that is only 1ms from the other but from another day should *NOT* be considered from the same second (A and B switched)',
          inputATs: new Date('2022-01-15T00:00:00.000Z').getTime(),
          inputBTs: new Date('2022-01-14T23:59:59.999Z').getTime(),
          expected: false,
        },
        {
          description:
            'timestamp that is only 1ms from the other but from another day should *NOT* be considered from the same second (A and B switched)',
          inputATs: new Date('2022-01-14T05:05:59.999Z').getTime(),
          inputBTs: new Date('2022-01-15T05:06:00.000Z').getTime(),
          expected: false,
        },
        {
          description:
            'timestamp that is less than a second apart but from different seconds should *NOT* be considered from the same second',
          inputATs: new Date('2022-01-15T04:45:45.750Z').getTime(),
          inputBTs: new Date('2022-01-15T05:45:46.110Z').getTime(),
          expected: false,
        },
      ].forEach((testMeta) => {
        testAreTimestampsFromSameXFunction(areTimestampsFromSameUtcSecond, testMeta);
      });
    });
  });
});
