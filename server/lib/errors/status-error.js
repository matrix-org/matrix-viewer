'use strict';

var http = require('http');

/* Create an error as per http://bluebirdjs.com/docs/api/catch.html */
function StatusError(status, inputMessage) {
  let message = inputMessage;
  if (!inputMessage) {
    message = http.STATUS_CODES[status] || http.STATUS_CODES['500'];
  }

  this.message = `${status} - ${message}`;
  // This will be picked by the default Express error handler and assign the status code,
  // https://expressjs.com/en/guide/error-handling.html#the-default-error-handler
  this.status = status;
  this.name = 'StatusError';
  Error.captureStackTrace(this, StatusError);
}
StatusError.prototype = Object.create(Error.prototype);
StatusError.prototype.constructor = StatusError;

module.exports = StatusError;
