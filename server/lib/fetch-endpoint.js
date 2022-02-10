const assert = require('assert');
const fetch = require('node-fetch');

const { matrixAccessToken } = require('../../secrets.json');
assert(matrixAccessToken);

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

async function fetchEndpoint(endpoint) {
  const res = await fetch(endpoint, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${matrixAccessToken}`,
    },
  });
  await checkResponseStatus(res);
  const data = await res.json();
  return data;
}

module.exports = fetchEndpoint;
