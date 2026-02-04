/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Hono Server
   High-performance server with middleware stack
   ═══════════════════════════════════════════════════════════════════════════════ */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { timing } from 'hono/timing';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { config } from './config';
import { pagesRouter } from './routes/pages';
import { apiRouter } from './routes/api';

// Types
export type Env = {
  Variables: {
    requestId: string;
    startTime: number;
  };
};

export function createServer() {
  const app = new Hono<Env>();

  // ─────────────────────────────────────────────────────────────────────────────
  // MIDDLEWARE STACK
  // ─────────────────────────────────────────────────────────────────────────────

  // Request ID & timing
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID().slice(0, 8));
    c.set('startTime', performance.now());
    await next();
    const duration = (performance.now() - c.get('startTime')).toFixed(2);
    c.header('X-Request-Id', c.get('requestId'));
    c.header('X-Response-Time', `${duration}ms`);
  });

  // Logger (pretty format)
  app.use('*', logger((message, ...rest) => {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`  \x1b[90m${timestamp}\x1b[0m ${message}`, ...rest);
  }));

  // Compression
  app.use('*', compress());

  // Security headers
  app.use('*', secureHeaders());

  // CORS for API routes
  app.use('/api/*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }));

  // Timing headers
  app.use('*', timing());

  // ─────────────────────────────────────────────────────────────────────────────
  // ROUTES
  // ─────────────────────────────────────────────────────────────────────────────

  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'healthy',
      service: config.appName,
      version: config.appVersion,
      timestamp: new Date().toISOString(),
    });
  });

  // API routes (proxy to Brain)
  app.route('/api', apiRouter);

  // Page routes
  app.route('/', pagesRouter);

  // ─────────────────────────────────────────────────────────────────────────────
  // ERROR HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  app.onError((err, c) => {
    console.error(`\x1b[31m  ✗ Error:\x1b[0m ${err.message}`);
    
    if (c.req.header('Accept')?.includes('application/json')) {
      return c.json({ error: err.message }, 500);
    }
    
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error - ${config.appName}</title>
          <style>
            body {
              background: #000;
              color: #fff;
              font-family: system-ui, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
            }
            .error {
              text-align: center;
              padding: 2rem;
            }
            .error h1 {
              color: #FF0080;
              font-size: 4rem;
              margin: 0;
            }
            .error p {
              color: #888;
              margin-top: 1rem;
            }
            .error a {
              color: #FF0080;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>500</h1>
            <p>Something went wrong</p>
            <p><a href="/">← Back to Dashboard</a></p>
          </div>
        </body>
      </html>
    `, 500);
  });

  app.notFound((c) => {
    if (c.req.header('Accept')?.includes('application/json')) {
      return c.json({ error: 'Not found' }, 404);
    }
    
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>404 - ${config.appName}</title>
          <style>
            body {
              background: #000;
              color: #fff;
              font-family: system-ui, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
            }
            .error {
              text-align: center;
              padding: 2rem;
            }
            .error h1 {
              color: #FF0080;
              font-size: 4rem;
              margin: 0;
            }
            .error p {
              color: #888;
              margin-top: 1rem;
            }
            .error a {
              color: #FF0080;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>404</h1>
            <p>Page not found</p>
            <p><a href="/">← Back to Dashboard</a></p>
          </div>
        </body>
      </html>
    `, 404);
  });

  return app;
}
