'use strict';

const { RetainedObservableValue, PowerLevels } = require('hydrogen-view-sdk');

// Fake power levels for viewing the room anonymously
const stubPowerLevels = new PowerLevels({
  powerLevelEvent: {},
  ownUserId: 'xxx-ownUserId',
  membership: null,
});
const stubPowerLevelsObservable = new RetainedObservableValue(stubPowerLevels, () => {
  // freeCallback
  //
  // I don't think we need to do anything here 🤷
});

module.exports = stubPowerLevelsObservable;
