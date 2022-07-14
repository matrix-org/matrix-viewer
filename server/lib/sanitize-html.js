'use strict';

const createDOMPurify = require('dompurify');
const { parseHTML } = require('linkedom');

const dom = parseHTML(`
<!doctype html>
<html>
  <head></head>
  <body></body>
</html>
`);

const DOMPurify = createDOMPurify(dom.window);

function sanitizeHtml(dirtyHtml) {
  const clearHtml = DOMPurify.sanitize(dirtyHtml);
  return clearHtml;
}

module.exports = sanitizeHtml;
