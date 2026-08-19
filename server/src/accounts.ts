import { randomUUID } from 'node:crypto';
import type { DB } from './db.js';

export const ACCOUNT_TYPES = ['checking', 'savings', 'credit'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  description: string;
  createdAt: string;
}

interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  created_at: string;
}

interface TransactionRow {
  id: string;
  account_id: string;
  amount: number;
  description: string;
  created_at: string;
}

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  name: row.name,
  type: row.type,
  currency: row.currency,
  balance: row.balance,
  createdAt: row.created_at,
});

const toTransaction = (row: TransactionRow): Transaction => ({
  id: row.id,
  accountId: row.account_id,
  amount: row.amount,
  description: row.description,
  createdAt: row.created_at,
});

export class AccountNotFoundError extends Error {
  constructor(id: string) {
    super(`Account ${id} not found`);
    this.name = 'AccountNotFoundError';
  }
}

export class AccountsRepository {
  constructor(private readonly db: DB) {}

  list(): Account[] {
    const rows = this.db
      .prepare('SELECT * FROM accounts ORDER BY created_at DESC')
      .all() as AccountRow[];
    return rows.map(toAccount);
  }

  get(id: string): Account | undefined {
    const row = this.db
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(id) as AccountRow | undefined;
    return row ? toAccount(row) : undefined;
  }

  create(input: {
    name: string;
    type: AccountType;
    currency?: string;
    openingBalance?: number;
  }): Account {
    const account: Account = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      currency: input.currency ?? 'USD',
      balance: input.openingBalance ?? 0,
      createdAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        `INSERT INTO accounts (id, name, type, currency, balance, created_at)
         VALUES (@id, @name, @type, @currency, @balance, @createdAt)`,
      )
      .run(account);

    return account;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    return result.changes > 0;
  }

  listTransactions(accountId: string): Transaction[] {
    if (!this.get(accountId)) throw new AccountNotFoundError(accountId);
    const rows = this.db
      .prepare(
        'SELECT * FROM transactions WHERE account_id = ? ORDER BY created_at DESC',
      )
      .all(accountId) as TransactionRow[];
    return rows.map(toTransaction);
  }

  /**
   * Record a transaction and atomically adjust the account balance. A positive
   * amount is a deposit, a negative amount is a withdrawal.
   */
  addTransaction(
    accountId: string,
    input: { amount: number; description?: string },
  ): { transaction: Transaction; account: Account } {
    const run = this.db.transaction(() => {
      const account = this.get(accountId);
      if (!account) throw new AccountNotFoundError(accountId);

      const transaction: Transaction = {
        id: randomUUID(),
        accountId,
        amount: input.amount,
        description: input.description ?? '',
        createdAt: new Date().toISOString(),
      };

      this.db
        .prepare(
          `INSERT INTO transactions (id, account_id, amount, description, created_at)
           VALUES (@id, @accountId, @amount, @description, @createdAt)`,
        )
        .run(transaction);

      this.db
        .prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
        .run(input.amount, accountId);

      return { transaction, account: this.get(accountId)! };
    });

    return run();
  }
}
