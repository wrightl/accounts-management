import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app.js';
import { openDatabase, type DB } from './db.js';

describe('accounts-management API', () => {
  let db: DB;
  let app: Express;

  beforeEach(() => {
    db = openDatabase(':memory:');
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  it('reports health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('starts with no accounts', async () => {
    const res = await request(app).get('/api/accounts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('creates an account with an opening balance', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .send({ name: 'Main Checking', type: 'checking', openingBalance: 5000 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Main Checking',
      type: 'checking',
      currency: 'USD',
      balance: 5000,
    });
    expect(res.body.id).toBeTruthy();
  });

  it('rejects invalid account payloads', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .send({ name: '', type: 'not-a-type' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request');
  });

  it('records transactions and updates the balance atomically', async () => {
    const created = await request(app)
      .post('/api/accounts')
      .send({ name: 'Savings', type: 'savings', openingBalance: 0 });
    const id = created.body.id;

    const deposit = await request(app)
      .post(`/api/accounts/${id}/transactions`)
      .send({ amount: 10000, description: 'Payday' });
    expect(deposit.status).toBe(201);
    expect(deposit.body.account.balance).toBe(10000);

    const withdrawal = await request(app)
      .post(`/api/accounts/${id}/transactions`)
      .send({ amount: -2500, description: 'Groceries' });
    expect(withdrawal.status).toBe(201);
    expect(withdrawal.body.account.balance).toBe(7500);

    const history = await request(app).get(`/api/accounts/${id}/transactions`);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(2);
  });

  it('rejects zero-amount transactions', async () => {
    const created = await request(app)
      .post('/api/accounts')
      .send({ name: 'Card', type: 'credit' });
    const res = await request(app)
      .post(`/api/accounts/${created.body.id}/transactions`)
      .send({ amount: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown accounts', async () => {
    expect((await request(app).get('/api/accounts/does-not-exist')).status).toBe(404);
    expect(
      (await request(app).post('/api/accounts/does-not-exist/transactions').send({ amount: 100 }))
        .status,
    ).toBe(404);
  });

  it('deletes accounts and cascades transactions', async () => {
    const created = await request(app)
      .post('/api/accounts')
      .send({ name: 'Temp', type: 'checking' });
    const id = created.body.id;
    await request(app).post(`/api/accounts/${id}/transactions`).send({ amount: 100 });

    const del = await request(app).delete(`/api/accounts/${id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/accounts/${id}`)).status).toBe(404);
  });
});
