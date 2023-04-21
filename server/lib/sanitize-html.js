import createDOMPurify from 'dompurify';
import { parseHTML } from 'linkedom';

const dom = parseHTML(`
<!doctype html>
<html>
  <head></head>
  <body></body>
</html>
`);

const DOMPurify = createDOMPurify(dom.window);

function sanitizeHtml(dirtyHtml) {
  const cleanHtml = DOMPurify.sanitize(dirtyHtml);
  return cleanHtml;
}

module.exports = sanitizeHtml;
