import 'dotenv/config';
import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { GameRoom } from './rooms/GameRoom';
import { db } from './utils/db';
import { JackpotManager } from './engine/JackpotManager';
import { DbClient, QueryResult } from './utils/db';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ---------------------------------------------------------------------------
// Wire real pg pool into the db singleton
// ---------------------------------------------------------------------------
function buildPgClient(pool: Pool): DbClient {
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
    },
    async transaction<T>(callback: (trx: DbClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const trxClient: DbClient = {
          query: async <U = Record<string, unknown>>(sql: string, params?: unknown[]) => {
            const r = await client.query(sql, params);
            return { rows: r.rows as U[], rowCount: r.rowCount ?? 0 };
          },
          transaction: () => { throw new Error('Nested transactions not supported'); },
        };
        const result = await callback(trxClient);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

async function main() {
  // --- PostgreSQL ---
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('SELECT 1'); // fail fast if DB not reachable
  console.log('[DB] PostgreSQL connected');

  // Patch the singleton db with the real implementation
  const realDb = buildPgClient(pool);
  Object.assign(db, realDb);

  // --- Redis ---
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
  });
  await redis.ping();
  console.log('[Redis] Connected');

  // --- JackpotManager singleton ---
  await JackpotManager.getInstance(realDb, redis);
  console.log('[Jackpot] Pool restored from DB');

  // --- Express app + health endpoints ---
  const app = express();
  app.use(cors({
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : ['http://localhost:30090', 'http://localhost:8080'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'cache-control'],
  }));
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok', ts: Date.now() }));
  app.get('/ready', async (_req: Request, res: Response) => {
    try {
      await pool.query('SELECT 1');
      await redis.ping();
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'not ready', error: String(err) });
    }
  });

  // Jackpot pool endpoint (read-only, no auth required for local testing)
  app.get('/api/v1/game/jackpot/pool', async (_req: Request, res: Response) => {
    try {
      const raw = await redis.get('game:jackpot:pool');
      const amount = raw ? Math.round(parseFloat(raw)) : 10000;
      res.json({ data: { amount } });
    } catch (err) {
      res.status(500).json({ error: { code: 'JACKPOT_ERROR', message: String(err) } });
    }
  });

  // --- HTTP + Colyseus ---
  const httpServer = http.createServer(app);
  const corsOptions = {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : ['http://localhost:30090', 'http://localhost:8080'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'cache-control'],
  };
  // Colyseus handles OPTIONS at the raw HTTP level via DEFAULT_CORS_HEADERS —
  // Express cors middleware doesn't reach it. Override the header directly.
  (matchMaker.controller as Record<string, unknown>)['DEFAULT_CORS_HEADERS'] = {
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, cache-control',
    'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Max-Age': '2592000',
  };
  const transport = new WebSocketTransport({ server: httpServer });
  const gameServer = new Server({ transport });

  gameServer.define('fishing_room', GameRoom);

  await gameServer.listen(PORT);
  console.log(`\n🎮  Fishing Arcade Game server running`);
  console.log(`    HTTP  → http://localhost:${PORT}`);
  console.log(`    WS    → ws://localhost:${PORT}`);
  console.log(`    Health → http://localhost:${PORT}/health`);
  console.log(`    Jackpot → http://localhost:${PORT}/api/v1/game/jackpot/pool\n`);

  // --- Graceful shutdown ---
  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] Shutting down...`);
    await gameServer.gracefullyShutdown();
    await redis.quit();
    await pool.end();
    console.log('[Shutdown] Done');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[FATAL] Server failed to start:', err);
  process.exit(1);
});
