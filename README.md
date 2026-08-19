# accounts-management

A small full-stack **accounts management** application: create financial accounts,
record deposits/withdrawals, and track balances and transaction history.

## Stack

| Layer    | Tech                                              |
| -------- | ------------------------------------------------- |
| Frontend | React 18 + Vite + TypeScript (`web/`)             |
| Backend  | Express + TypeScript (`server/`)                  |
| Storage  | SQLite via `better-sqlite3` (no external service) |
| Tooling  | npm workspaces, ESLint, Vitest                    |

The SQLite database lives at `server/data/accounts.sqlite` by default (git-ignored).
Tests use an in-memory database, so they never touch that file.

## Prerequisites

- Node.js >= 20 (repo is developed against Node 22)
- npm 10+

## Getting started

```bash
npm install        # installs both workspaces
npm run dev        # runs the API (:3001) and web app (:5173) together
```

Then open http://localhost:5173. The Vite dev server proxies `/api/*` to the
API on port 3001.

## Useful commands

| Command             | Description                                    |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Run API + web dev servers in parallel          |
| `npm run dev:server`| Run only the API (`tsx watch`)                 |
| `npm run dev:web`   | Run only the Vite dev server                   |
| `npm run build`     | Type-check + build both workspaces             |
| `npm run lint`      | Lint both workspaces                           |
| `npm run typecheck` | Type-check both workspaces                     |
| `npm test`          | Run the backend test suite (Vitest)            |

## API

Base URL: `http://localhost:3001`

| Method   | Path                             | Description                       |
| -------- | -------------------------------- | --------------------------------- |
| `GET`    | `/api/health`                    | Health check                      |
| `GET`    | `/api/accounts`                  | List accounts                     |
| `POST`   | `/api/accounts`                  | Create an account                 |
| `GET`    | `/api/accounts/:id`              | Fetch a single account            |
| `DELETE` | `/api/accounts/:id`              | Delete an account (cascades)      |
| `GET`    | `/api/accounts/:id/transactions` | List transactions for an account  |
| `POST`   | `/api/accounts/:id/transactions` | Add a transaction, adjust balance |

Monetary amounts are stored and returned as integer **minor units** (cents).
A positive transaction `amount` is a deposit; a negative amount is a withdrawal.

Example:

```bash
# Create an account with a $50.00 opening balance
curl -s localhost:3001/api/accounts \
  -H 'content-type: application/json' \
  -d '{"name":"Main Checking","type":"checking","openingBalance":5000}'

# Deposit $100.00
curl -s localhost:3001/api/accounts/<id>/transactions \
  -H 'content-type: application/json' \
  -d '{"amount":10000,"description":"Payday"}'
```

## Cloud Agent environment

`.cursor/environment.json` configures the Cursor Cloud Agent environment:

- `install`: `npm install` (installs both workspaces)
- `terminals`: `api` and `web` dev servers
- `ports`: 3001 (API) and 5173 (web)
