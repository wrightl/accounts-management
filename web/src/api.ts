export type AccountType = 'checking' | 'savings' | 'credit';

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

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listAccounts: () => fetch('/api/accounts').then((r) => handle<Account[]>(r)),

  createAccount: (input: {
    name: string;
    type: AccountType;
    currency?: string;
    openingBalance?: number;
  }) =>
    fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then((r) => handle<Account>(r)),

  deleteAccount: (id: string) =>
    fetch(`/api/accounts/${id}`, { method: 'DELETE' }).then((r) => handle<void>(r)),

  listTransactions: (id: string) =>
    fetch(`/api/accounts/${id}/transactions`).then((r) => handle<Transaction[]>(r)),

  addTransaction: (id: string, input: { amount: number; description?: string }) =>
    fetch(`/api/accounts/${id}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then((r) => handle<{ transaction: Transaction; account: Account }>(r)),
};

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
