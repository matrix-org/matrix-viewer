'use strict';

var http = require('http');

/* Create an error as per http://bluebirdjs.com/docs/api/catch.html */
function StatusError(status, inputMessage) {
  let message = inputMessage;
  if (!inputMessage) {
    message = http.STATUS_CODES[status] || http.STATUS_CODES['500'];
  }

  this.message = message;
  this.status = status;
  this.name = 'StatusError';
  Error.captureStackTrace(this, StatusError);
}
StatusError.prototype = Object.create(Error.prototype);
StatusError.prototype.constructor = StatusError;

module.exports = StatusError;
