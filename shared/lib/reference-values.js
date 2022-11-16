'use strict';

const MS_LOOKUP = {
  ONE_DAY_IN_MS: 24 * 60 * 60 * 1000,
  ONE_HOUR_IN_MS: 60 * 60 * 1000,
  ONE_MINUTE_IN_MS: 60 * 1000,
  ONE_SECOND_IN_MS: 1000,
};

const TIME_PRECISION_VALUES = {
  minutes: 'minutes',
  seconds: 'seconds',
};

module.exports = {
  MS_LOOKUP,
  TIME_PRECISION_VALUES,
};
