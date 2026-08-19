import { createApp } from './app.js';
import { openDatabase } from './db.js';

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? 'data/accounts.sqlite';

const db = openDatabase(DB_PATH);
const app = createApp(db);

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`accounts-management API listening on http://localhost:${PORT}`);
});

const shutdown = (signal: string) => {
  // eslint-disable-next-line no-console
  console.log(`\nReceived ${signal}, shutting down...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
