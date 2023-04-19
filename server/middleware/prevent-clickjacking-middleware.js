'use strict';

// Don't allow others to iframe embed which can lead to clickjacking
function preventClickjackingMiddleware(req, res, next) {
  res.set('X-Frame-Options', 'DENY');

  next();
}

module.exports = preventClickjackingMiddleware;
