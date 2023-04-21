console.log('server process.env.NODE_ENV', process.env.NODE_ENV);

import assert from 'assert';
import config from './lib/config';
const basePort = config.get('basePort');
assert(basePort);
const tracing = config.get('tracing');

if (tracing) {
  console.log('Tracing is active 🕵️');
  import { startTracing } from './tracing/tracing.js';
  startTracing();
}

import express from 'express';

import installRoutes from './routes/install-routes';

const app = express();
installRoutes(app);

const server = app.listen(basePort);

export default server;
