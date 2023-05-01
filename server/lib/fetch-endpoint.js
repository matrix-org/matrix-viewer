'use strict';

const assert = require('assert');

class HTTPResponseError extends Error {
  constructor(response, responseText, ...args) {
    super(
      `HTTP Error Response: ${response.status} ${response.statusText}: ${responseText}\n    URL=${response.url}`,
      ...args
    );
    this.response = response;
  }
}

const checkResponseStatus = async (response) => {
  if (response.ok) {
    // response.status >= 200 && response.status < 300
    return response;
  } else {
    const responseText = await response.text();
    throw new HTTPResponseError(response, responseText);
  }
};

async function fetchEndpoint(endpoint, options = {}) {
  assert(!options.signal, 'Use `options.abortSignal` instead of `options.signal`');
  const { method, accessToken } = options;
  const headers = options.headers || {};

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(endpoint, {
    method,
    headers,
    body: options.body,
    // Abort signal to cancel the request
    signal: options.abortSignal,
  });
  await checkResponseStatus(res);

  return res;
}

async function fetchEndpointAsText(endpoint, options) {
  const res = await fetchEndpoint(endpoint, options);
  const data = await res.text();
  return { data, res };
}

async function fetchEndpointAsJson(endpoint, options) {
  const opts = {
    ...(options || {}),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  };

  if (options?.body) {
    opts.body = JSON.stringify(options.body);
  }

  const res = await fetchEndpoint(endpoint, opts);
  const data = await res.json();
  return { data, res };
}

module.exports = {
  HTTPResponseError,
  fetchEndpoint,
  fetchEndpointAsText,
  fetchEndpointAsJson,
};
