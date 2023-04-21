console.log('server process.env.NODE_ENV', process.env.NODE_ENV);

import assert from 'assert';
import config from './lib/config.js';
const basePort = config.get('basePort');
assert(basePort);
const tracing = config.get('tracing');

if (tracing) {
  console.log('Tracing is active 🕵️');
  const { startTracing } = await import('./tracing/tracing.js');
  startTracing();
}

import express from 'express';

import installRoutes from './routes/install-routes.js';

const app = express();
installRoutes(app);

const server = app.listen(basePort);

export default server;
