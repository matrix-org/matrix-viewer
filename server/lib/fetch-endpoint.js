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

async function fetchEndpoint(endpoint, { accessToken }) {
  const res = await fetch(endpoint, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  await checkResponseStatus(res);
  const data = await res.json();
  return data;
}

module.exports = fetchEndpoint;
