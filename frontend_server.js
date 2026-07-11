/**
 * FitPulse Static Frontend Server — port 8080
 * Serves the fitpulse/ directory as a static site.
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const SERVE_DIR = path.join(__dirname, 'fitpulse');
const PORT = 8080;

const MIME = {
  '.html': 'text/html',
  '.css' : 'text/css',
  '.js'  : 'application/javascript',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif' : 'image/gif',
  '.svg' : 'image/svg+xml',
  '.ico' : 'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf' : 'font/ttf',
};

const server = http.createServer((req, res) => {
  let pathname = url.parse(req.url).pathname;
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  // Security: prevent directory traversal
  const safePath = path.normalize(path.join(SERVE_DIR, pathname));
  if (!safePath.startsWith(SERVE_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  // If no extension, try appending .html
  let filePath = safePath;
  if (!path.extname(filePath) && !fs.existsSync(filePath)) {
    filePath = filePath + '.html';
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Try index.html fallback
      const fallback = path.join(SERVE_DIR, 'index.html');
      fs.readFile(fallback, (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('404 Not Found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(d2);
      });
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FitPulse Frontend running at http://localhost:${PORT}`);
  console.log(`Serving: ${SERVE_DIR}`);
  console.log('Press Ctrl+C to stop.');
});
