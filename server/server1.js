const vm = require('vm');
const path = require('path');
const { readFile } = require('fs').promises;
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
      <head>
        <title>Hello SSR</title>
      </head>
      <body>
        <div id="app" class="hydrogen">App container</div>
      </body>
    </html>
  `);

  // So require(...) works in the vm
  dom.require = require;
  // So we can see logs from the underlying vm
  dom.console = console;

  const vmContext = vm.createContext(dom);
  // Make the dom properties available in sub-`require(...)` calls
  vmContext.global.window = dom;
  vmContext.global.document = dom.document;
  vmContext.global.navigator = dom.navigator;

  const hydrogenRenderScriptCode = await readFile(
    path.resolve(__dirname, './hydrogen-render-script.js'),
    'utf8'
  );
  const hydrogenRenderScript = new vm.Script(hydrogenRenderScriptCode);
  const vmResult = hydrogenRenderScript.runInContext(vmContext);
  await vmResult;

  console.log('vmResult', vmResult);

  const documentString = dom.document.toString();
  console.log('documentString', documentString);
}

app.get('/', async function (req, res) {
  await renderToString();

  res.send('Hello World');
});

app.listen(3050);
