import { test, expect } from '@playwright/test';

const BASE_URL = 'https://email-management-app-production.up.railway.app';

test.describe('Email Management App - E2E Tests', () => {
  test('should load login page', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle('Email Manager');
    await expect(page.locator('h1')).toContainText('Sign In');
  });

  test('should login with correct password', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'changeme123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(BASE_URL + '/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('should show accounts page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'changeme123');
    await page.click('button[type="submit"]');

    // Navigate to accounts
    await page.click('a[href="/accounts"]');
    await expect(page).toHaveURL(BASE_URL + '/accounts');
    await expect(page.locator('h1')).toContainText('Accounts');
  });

  test('should show search page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'changeme123');
    await page.click('button[type="submit"]');

    // Navigate to search
    await page.click('a[href="/search"]');
    await expect(page).toHaveURL(BASE_URL + '/search');
    await expect(page.locator('h1')).toContainText('Search');
  });

  test('should show cleanup page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'changeme123');
    await page.click('button[type="submit"]');

    // Navigate to cleanup
    await page.click('a[href="/cleanup"]');
    await expect(page).toHaveURL(BASE_URL + '/cleanup');
    await expect(page.locator('h1')).toContainText('Cleanup');
  });

  test('should show rules page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'changeme123');
    await page.click('button[type="submit"]');

    // Navigate to rules
    await page.click('a[href="/rules"]');
    await expect(page).toHaveURL(BASE_URL + '/rules');
    await expect(page.locator('h1')).toContainText('Rules');
  });

  test('should show AI chat page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'changeme123');
    await page.click('button[type="submit"]');

    // Navigate to AI chat
    await page.click('a[href="/ai-chat"]');
    await expect(page).toHaveURL(BASE_URL + '/ai-chat');
    await expect(page.locator('h1')).toContainText('AI');
  });

  test('should reject wrong password', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });
});
