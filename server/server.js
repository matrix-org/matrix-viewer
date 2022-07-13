'use strict';

console.log('server process.env.NODE_ENV', process.env.NODE_ENV);

if (process.argv.includes('--tracing')) {
  console.log('Tracing is running 🕵️');
  require('./tracing.js');
}

const express = require('express');

const installRoutes = require('./routes/install-routes');
const config = require('./lib/config');
const basePort = config.get('basePort');

const app = express();
installRoutes(app);

const server = app.listen(basePort);

module.exports = server;
