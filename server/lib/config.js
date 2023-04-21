// This file is based off the Gitter config,
// https://gitlab.com/gitlab-org/gitter/env/blob/master/lib/config.js

const path = require('path');
const nconf = require('nconf');
const JSON5 = require('json5');

function configureNodeEnv() {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'production') {
    return 'prod';
  } else if (nodeEnv === 'development') {
    return 'dev';
  }
  if (nodeEnv) return nodeEnv;

  // Default to NODE_ENV=dev
  process.env.NODE_ENV = 'dev';
  return 'dev';
}

const nodeEnv = configureNodeEnv();
console.log(`Config is using nodeEnv=${nodeEnv}`);
const configDir = path.join(__dirname, '../../config');

// Setup nconf to use (in-order):
//   1. Command-line arguments (argv)
//   2. Environment variables (env)
//   3. `config/config-{env}.json` files
nconf.argv().env('__');

nconf.add('envUser', {
  type: 'file',
  file: path.join(configDir, 'config.' + nodeEnv + '.user-overrides.json'),
  format: JSON5,
});

// Only use user-overrides in dev
if (nodeEnv === 'dev') {
  nconf.add('user', {
    type: 'file',
    file: path.join(configDir, 'config.user-overrides.json'),
    format: JSON5,
  });
}

nconf.add('nodeEnv', {
  type: 'file',
  file: path.join(configDir, 'config.' + nodeEnv + '.json'),
  format: JSON5,
});
nconf.add('defaults', {
  type: 'file',
  file: path.join(configDir, 'config.default.json'),
  format: JSON5,
});

module.exports = nconf;
