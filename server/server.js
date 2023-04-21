console.log('server process.env.NODE_ENV', process.env.NODE_ENV);

const assert = require('assert');
const config = require('./lib/config');
const basePort = config.get('basePort');
assert(basePort);
const tracing = config.get('tracing');

if (tracing) {
  console.log('Tracing is active 🕵️');
  const { startTracing } = require('./tracing/tracing.js');
  startTracing();
}

const express = require('express');

const installRoutes = require('./routes/install-routes');

const app = express();
installRoutes(app);

const server = app.listen(basePort);

module.exports = server;
