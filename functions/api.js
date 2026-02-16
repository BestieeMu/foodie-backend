const serverless = require('serverless-http');
const { app } = require('../server');

// Wrap the existing Express app so it can run as a Netlify Function.
module.exports.handler = serverless(app);

