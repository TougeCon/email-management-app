import { test, expect } from '@playwright/test';

const BASE_URL = 'https://email-management-app-production.up.railway.app';

test.describe('Email Management App - E2E Tests', () => {
  test('should load login page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await expect(page).toHaveTitle('Email Manager');
    await expect(page.getByText('Email Manager')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should login with correct password', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'changeme123');
    await page.click('button[type="submit"]');

    // Wait for navigation with longer timeout
    await page.waitForURL(BASE_URL + '/dashboard', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('should show accounts page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'changeme123');
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE_URL + '/dashboard', { timeout: 10000 });

    // Navigate to accounts - wait for sidebar to load
    await page.waitForSelector('a[href="/accounts"]', { timeout: 10000 });
    await page.click('a[href="/accounts"]');
    await page.waitForURL(BASE_URL + '/accounts', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Accounts');
  });

  test('should show search page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'changeme123');
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE_URL + '/dashboard', { timeout: 10000 });

    // Navigate to search
    await page.waitForSelector('a[href="/search"]', { timeout: 10000 });
    await page.click('a[href="/search"]');
    await page.waitForURL(BASE_URL + '/search', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Search');
  });

  test('should show cleanup page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'changeme123');
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE_URL + '/dashboard', { timeout: 10000 });

    // Navigate to cleanup
    await page.waitForSelector('a[href="/cleanup"]', { timeout: 10000 });
    await page.click('a[href="/cleanup"]');
    await page.waitForURL(BASE_URL + '/cleanup', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Cleanup');
  });

  test('should show rules page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'changeme123');
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE_URL + '/dashboard', { timeout: 10000 });

    // Navigate to rules
    await page.waitForSelector('a[href="/rules"]', { timeout: 10000 });
    await page.click('a[href="/rules"]');
    await page.waitForURL(BASE_URL + '/rules', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Rules');
  });

  test('should show AI chat page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'changeme123');
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE_URL + '/dashboard', { timeout: 10000 });

    // Navigate to AI chat
    await page.waitForSelector('a[href="/ai-chat"]', { timeout: 10000 });
    await page.click('a[href="/ai-chat"]');
    await page.waitForURL(BASE_URL + '/ai-chat', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('AI');
  });

  test('should reject wrong password', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('text=Invalid password')).toBeVisible({ timeout: 5000 });
  });
});
