'use strict';

const MS_LOOKUP = {
  ONE_DAY_IN_MS: 24 * 60 * 60 * 1000,
  ONE_HOUR_IN_MS: 60 * 60 * 1000,
  ONE_MINUTE_IN_MS: 60 * 1000,
  ONE_SECOND_IN_MS: 1000,
};

const TIME_PRECISION_VALUES = {
  // no time present - `/date/2022/11/16`
  none: null,
  // 23:59 - `/date/2022/11/16T23:59`
  minutes: 'minutes',
  // 23:59:59 - `/date/2022/11/16T23:59:59`
  seconds: 'seconds',
  // 23:59:59.999 - `/date/2022/11/16T23:59:59.999`
  millisecond: 'millisecond',
};

const DIRECTION = {
  forward: 'f',
  backward: 'b',
};

module.exports = {
  MS_LOOKUP,
  TIME_PRECISION_VALUES,
  DIRECTION,
};
