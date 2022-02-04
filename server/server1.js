const vm = require('vm');
const path = require('path');
const { readFile } = require('fs').promises;
const crypto = require('crypto');
const { parseHTML } = require('linkedom');
const express = require('express');
const app = express();

// const hsdk = require('hydrogen-view-sdk');
// console.log(`require.resolve('hydrogen-view-sdk')`, require.resolve('hydrogen-view-sdk'));
// console.log('hsdk', hsdk);
// console.log('FragmentIdComparer', hsdk.FragmentIdComparer);

async function renderToString() {
  const dom = parseHTML(`
    <!doctype html>
    <html lang="en">
      <body>
        <div id="app" class="hydrogen">App container</div>
      </body>
    </html>
  `);

  if (!dom.crypto) {
    dom.crypto = crypto.webcrypto;
  }

  if (!dom.requestAnimationFrame) {
    dom.requestAnimationFrame = function (cb) {
      setTimeout(cb, 0);
    };
  }

  const vmContext = vm.createContext(dom);
  // Make the dom properties available in sub-`require(...)` calls
  vmContext.global.window = dom.window;
  vmContext.global.document = dom.document;
  vmContext.global.Node = dom.Node;
  vmContext.global.navigator = dom.navigator;
  vmContext.global.DOMParser = dom.DOMParser;

  // So require(...) works in the vm
  vmContext.global.require = require;
  // So we can see logs from the underlying vm
  vmContext.global.console = console;

  const hydrogenRenderScriptCode = await readFile(
    path.resolve(__dirname, './hydrogen-render-script.js'),
    'utf8'
  );
  const hydrogenRenderScript = new vm.Script(hydrogenRenderScriptCode);
  const vmResult = hydrogenRenderScript.runInContext(vmContext);
  // Wait for everything to render
  // (waiting on the promise returned from `hydrogen-render-script.js`)
  await vmResult;

  const documentString = dom.document.querySelector('#app').toString();
  //console.log('documentString', documentString);
  return documentString;
}

app.get('/style.css', async function (req, res) {
  const htmlOutput = await renderToString();

  res.set('Content-Type', 'text/css');
  res.sendFile(require.resolve('hydrogen-view-sdk/style.css'));
});

app.get('/', async function (req, res) {
  const hydrogenHtmlOutput = await renderToString();

  const pageHtml = `
    <!doctype html>
    <html lang="en">
      <head>
      <link href="style.css" rel="stylesheet">
      </head>
      <body>
        ${hydrogenHtmlOutput}
      </body>
    </html>
  `;

  res.set('Content-Type', 'text/html');
  res.send(pageHtml);
});

app.listen(3050);
