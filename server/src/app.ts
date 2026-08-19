import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { z } from 'zod';
import type { DB } from './db.js';
import { ACCOUNT_TYPES, AccountNotFoundError, AccountsRepository } from './accounts.js';

const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  openingBalance: z.number().int().optional(),
});

const createTransactionSchema = z.object({
  amount: z.number().int().refine((v) => v !== 0, 'amount must be non-zero'),
  description: z.string().trim().max(280).optional(),
});

export function createApp(db: DB): Express {
  const app = express();
  const repo = new AccountsRepository(db);

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'accounts-management', time: new Date().toISOString() });
  });

  app.get('/api/accounts', (_req: Request, res: Response) => {
    res.json(repo.list());
  });

  app.post('/api/accounts', (req: Request, res: Response) => {
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const account = repo.create(parsed.data);
    res.status(201).json(account);
  });

  app.get('/api/accounts/:id', (req: Request, res: Response) => {
    const account = repo.get(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  });

  app.delete('/api/accounts/:id', (req: Request, res: Response) => {
    const deleted = repo.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Account not found' });
    res.status(204).send();
  });

  app.get('/api/accounts/:id/transactions', (req: Request, res: Response) => {
    try {
      res.json(repo.listTransactions(req.params.id));
    } catch (err) {
      if (err instanceof AccountNotFoundError) {
        return res.status(404).json({ error: 'Account not found' });
      }
      throw err;
    }
  });

  app.post('/api/accounts/:id/transactions', (req: Request, res: Response) => {
    const parsed = createTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    try {
      const result = repo.addTransaction(req.params.id, parsed.data);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof AccountNotFoundError) {
        return res.status(404).json({ error: 'Account not found' });
      }
      throw err;
    }
  });

  // Centralised error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
