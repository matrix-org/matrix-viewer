const assert = require('assert');

const { fetchEndpointAsJson } = require('./server/lib/fetch-endpoint');

const config = require('./server/lib/config');
const basePort = config.get('basePort');
assert(basePort);

const healthCheckUrl = `http://localhost:${basePort}/health-check`;

(async () => {
  try {
    await fetchEndpointAsJson(healthCheckUrl);
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`Health check error: ${healthCheckUrl}`, err);
    process.exit(1);
  }
})();
