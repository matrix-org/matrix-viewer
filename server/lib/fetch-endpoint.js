'use strict';

const fetch = require('node-fetch');

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
  const { method, accessToken } = options;
  const headers = options.headers || {};

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(endpoint, {
    method,
    headers,
  });
  await checkResponseStatus(res);

  return res;
}

async function fetchEndpointAsText(endpoint, options) {
  const res = await fetchEndpoint(endpoint, options);
  const data = await res.text();
  return data;
}

async function fetchEndpointAsJson(endpoint, options) {
  const opts = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  };

  const res = await fetchEndpoint(endpoint, opts);
  const data = await res.json();
  return data;
}

module.exports = {
  fetchEndpoint,
  fetchEndpointAsText,
  fetchEndpointAsJson,
};
