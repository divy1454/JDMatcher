// Production server for Render deployment
// Uses Next.js standalone output mode
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const hostname = '0.0.0.0';

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, hostname, () => {
    console.log(`\n======================================================`);
    console.log(`  JDMatcher Enterprise Frontend`);
    console.log(`  Ready on http://${hostname}:${port}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`======================================================\n`);
  });
});
