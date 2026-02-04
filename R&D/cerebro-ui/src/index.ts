/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Entry Point
   Autonomous Infrastructure Intelligence Platform
   ═══════════════════════════════════════════════════════════════════════════════ */

import { createServer } from './server';
import { config } from './config';

// ASCII Art Banner
const banner = `
\x1b[35m
   ██████╗███████╗██████╗ ███████╗██████╗ ██████╗  ██████╗ 
  ██╔════╝██╔════╝██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔═══██╗
  ██║     █████╗  ██████╔╝█████╗  ██████╔╝██████╔╝██║   ██║
  ██║     ██╔══╝  ██╔══██╗██╔══╝  ██╔══██╗██╔══██╗██║   ██║
  ╚██████╗███████╗██║  ██║███████╗██████╔╝██║  ██║╚██████╔╝
   ╚═════╝╚══════╝╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ 
\x1b[0m
  \x1b[90m${config.appTagline}\x1b[0m
  \x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m
`;

console.log(banner);

// Create and start server
const app = createServer();

const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
});

console.log(`  \x1b[32m✓\x1b[0m Server running at \x1b[36mhttp://${server.hostname}:${server.port}\x1b[0m`);
console.log(`  \x1b[32m✓\x1b[0m Brain API at \x1b[36m${config.brainUrl}\x1b[0m`);
console.log(`  \x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n`);
