// via https://gitlab.com/gitterHQ/webapp/-/blob/615c78d0b0a314c2c9e4098b8d2ba0471d16961b/modules/templates/lib/safe-json.js
function safeJson(string) {
  if (!string) return string;
  // From http://benalpert.com/2012/08/03/preventing-xss-json.html
  return string.replace(/<\//g, '<\\/');
}

export default safeJson;
