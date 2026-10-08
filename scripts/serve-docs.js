#!/usr/bin/env node
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.resolve(__dirname, '../docs');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

export function createDocsServer() {
  return http.createServer((req, res) => {
    let reqPath = req.url ? req.url.split('?')[0] : '/';
    try {
      reqPath = decodeURIComponent(reqPath);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('400 Bad Request');
      return;
    }

    if (reqPath === '/') {
      reqPath = '/index.html';
    }

    const resolvedDocsDir = path.resolve(DOCS_DIR);
    const filePath = path.resolve(resolvedDocsDir, '.' + (reqPath.startsWith('/') ? reqPath : '/' + reqPath));

    // Prevent directory traversal
    const safePrefix = resolvedDocsDir.endsWith(path.sep) ? resolvedDocsDir : resolvedDocsDir + path.sep;
    if (filePath !== resolvedDocsDir && !filePath.startsWith(safePrefix)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback to index.html for SPA-like routes
        const fallbackPath = path.join(resolvedDocsDir, 'index.html');
        if (fs.existsSync(fallbackPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          const stream = fs.createReadStream(fallbackPath);
          stream.on('error', () => {
            if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error');
          });
          stream.pipe(res);
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      });
      stream.pipe(res);
    });
  });
}

// Only listen if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const server = createDocsServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\x1b[31mPort ${PORT} is already in use. Please specify another port: PORT=${PORT + 1} pnpm run docs\x1b[0m`);
    } else {
      console.error('\x1b[31mFailed to start docs server:\x1b[0m', err);
    }
    process.exit(1);
  });
  server.listen(PORT, () => {
    console.log(`\x1b[36m⚡ HydraOne Docs Portal running at: \x1b[1mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`\x1b[90mPress Ctrl+C to stop.\x1b[0m\n`);
  });
}
