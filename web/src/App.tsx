import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, formatMoney, type Account, type AccountType, type Transaction } from './api';

const ACCOUNT_TYPES: AccountType[] = ['checking', 'savings', 'credit'];

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const list = await api.listAccounts();
      setAccounts(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + a.balance, 0),
    [accounts],
  );

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Accounts Management</h1>
          <p className="subtitle">Track balances and transactions across your accounts</p>
        </div>
        <div className="net-worth">
          <span className="net-worth__label">Total balance</span>
          <span className="net-worth__value">{formatMoney(totalBalance, 'USD')}</span>
        </div>
      </header>

      {error && <div className="banner banner--error">{error}</div>}

      <main className="layout">
        <section className="panel">
          <div className="panel__header">
            <h2>Accounts</h2>
          </div>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : accounts.length === 0 ? (
            <p className="muted">No accounts yet. Create one to get started.</p>
          ) : (
            <ul className="account-list">
              {accounts.map((account) => (
                <li key={account.id}>
                  <button
                    className={`account-card ${account.id === selectedId ? 'is-active' : ''}`}
                    onClick={() => setSelectedId(account.id)}
                  >
                    <span className="account-card__name">{account.name}</span>
                    <span className={`chip chip--${account.type}`}>{account.type}</span>
                    <span className="account-card__balance">
                      {formatMoney(account.balance, account.currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <CreateAccountForm
            onCreated={async (created) => {
              await refresh();
              setSelectedId(created.id);
            }}
            onError={setError}
          />
        </section>

        <section className="panel">
          {selected ? (
            <AccountDetail account={selected} onChanged={refresh} onError={setError} />
          ) : (
            <p className="muted">Select or create an account to view its activity.</p>
          )}
        </section>
      </main>
    </div>
  );
}

function CreateAccountForm({
  onCreated,
  onError,
}: {
  onCreated: (account: Account) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [opening, setOpening] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const openingBalance = opening.trim() ? Math.round(Number(opening) * 100) : 0;
      const created = await api.createAccount({ name: name.trim(), type, openingBalance });
      setName('');
      setOpening('');
      setType('checking');
      await onCreated(created);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <h3>New account</h3>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main Checking"
          maxLength={120}
        />
      </label>
      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Opening balance
        <input
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
        />
      </label>
      <button type="submit" className="btn btn--primary" disabled={submitting || !name.trim()}>
        {submitting ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}

function AccountDetail({
  account,
  onChanged,
  onError,
}: {
  account: Account;
  onChanged: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [direction, setDirection] = useState<'deposit' | 'withdrawal'>('deposit');
  const [busy, setBusy] = useState(false);

  const loadTransactions = useCallback(async () => {
    try {
      setTransactions(await api.listTransactions(account.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load transactions');
    }
  }, [account.id, onError]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const submitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const magnitude = Math.round(Number(amount) * 100);
    if (!magnitude) return;
    setBusy(true);
    try {
      const signed = direction === 'withdrawal' ? -Math.abs(magnitude) : Math.abs(magnitude);
      await api.addTransaction(account.id, { amount: signed, description: description.trim() });
      setAmount('');
      setDescription('');
      await Promise.all([loadTransactions(), onChanged()]);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add transaction');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteAccount(account.id);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="detail">
      <div className="detail__header">
        <div>
          <h2>{account.name}</h2>
          <span className={`chip chip--${account.type}`}>{account.type}</span>
        </div>
        <div className="detail__balance">{formatMoney(account.balance, account.currency)}</div>
      </div>

      <form className="form form--inline" onSubmit={submitTransaction}>
        <div className="segmented">
          <button
            type="button"
            className={direction === 'deposit' ? 'is-active' : ''}
            onClick={() => setDirection('deposit')}
          >
            Deposit
          </button>
          <button
            type="button"
            className={direction === 'withdrawal' ? 'is-active' : ''}
            onClick={() => setDirection('withdrawal')}
          >
            Withdraw
          </button>
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          aria-label="Amount"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          aria-label="Description"
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !amount.trim()}>
          Add
        </button>
      </form>

      <h3>Recent activity</h3>
      {transactions.length === 0 ? (
        <p className="muted">No transactions yet.</p>
      ) : (
        <ul className="txn-list">
          {transactions.map((txn) => (
            <li key={txn.id} className="txn">
              <span className="txn__desc">{txn.description || '—'}</span>
              <span className="txn__date">{new Date(txn.createdAt).toLocaleString()}</span>
              <span className={`txn__amount ${txn.amount < 0 ? 'is-negative' : 'is-positive'}`}>
                {formatMoney(txn.amount, account.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button className="btn btn--danger" onClick={remove} disabled={busy}>
        Delete account
      </button>
    </div>
  );
}
