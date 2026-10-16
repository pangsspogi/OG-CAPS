import app from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';

const server = app.listen(config.PORT, () => {
  console.log(`OG CAPS server listening on port ${config.PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
