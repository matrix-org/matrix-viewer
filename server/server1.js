const express = require('express');
const asyncHandler = require('./express-async-handler');

const fetchEventsForTimestamp = require('./fetch-events-for-timestamp');
const renderHydrogenToString = require('./render-hydrogen-to-string');

const app = express();

app.get('/style.css', async function (req, res) {
  res.set('Content-Type', 'text/css');
  res.sendFile(require.resolve('hydrogen-view-sdk/style.css'));
});

app.get(
  '/',
  asyncHandler(async function (req, res) {
    const { events, stateEventMap } = await fetchEventsForTimestamp(
      '!HBehERstyQBxyJDLfR:my.synapse.server',
      new Date('2022-01-01').getTime()
    );

    const hydrogenHtmlOutput = await renderHydrogenToString(events, stateEventMap);

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
  })
);

app.listen(3050);
