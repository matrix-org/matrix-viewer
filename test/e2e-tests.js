'use strict';

const assert = require('assert');
const sdk = require('matrix-js-sdk');

const config = require('../config');
assert(config.testMatrixServerUrl);

const client = sdk.createClient(config.testMatrixServerUrl);

describe('matrix-public-archive', () => {
  it('asdf', async () => {
    await client.register(`user-${Math.floor(Math.random() * 1000000000)}`, 'awfe');
  });
});
