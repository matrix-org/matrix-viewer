'use strict';

const express = require('express');
const installRoutes = require('./routes/install-routes');

const app = express();
installRoutes(app);
app.listen(3050);
