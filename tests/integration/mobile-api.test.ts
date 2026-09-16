import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as validateAuth } from '@/app/api/mobile/auth/validate/route';
import { GET as getDashboard } from '@/app/api/mobile/dashboard/route';
import { GET as getExpenses, POST as createExpense } from '@/app/api/mobile/expenses/route';

describe('Mobile API Integration Tests', () => {
  describe('Auth Validation', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/mobile/auth/validate', {
        method: 'POST',
      });

      const response = await validateAuth(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.ok).toBe(false);
    });
  });

  describe('Dashboard API', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/mobile/dashboard', {
        method: 'GET',
      });

      const response = await getDashboard(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.ok).toBe(false);
    });
  });

  describe('Expenses API', () => {
    it('should return 401 for unauthenticated GET requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/mobile/expenses', {
        method: 'GET',
      });

      const response = await getExpenses(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.ok).toBe(false);
    });

    it('should return 401 for unauthenticated POST requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/mobile/expenses', {
        method: 'POST',
        body: JSON.stringify({
          description: 'Test expense',
          amountPence: 1000,
          category: 'Travel',
          expenseDate: '2024-01-01',
        }),
      });

      const response = await createExpense(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.ok).toBe(false);
    });

    it('should return 400 for POST with missing required fields', async () => {
      const request = new NextRequest('http://localhost:3000/api/mobile/expenses', {
        method: 'POST',
        body: JSON.stringify({
          description: 'Test expense',
        }),
      });

      const response = await createExpense(request);
      
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});
