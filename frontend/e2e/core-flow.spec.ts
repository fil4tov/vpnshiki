import { expect, test } from '@playwright/test';

test('administrator creates a user who controls participation until blocked', async ({ page }) => {
  const adminName = process.env.E2E_ADMIN_NAME ?? 'admin';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'change_me_now';
  const memberName = `Участник-${Date.now()}`;
  const initialPassword = 'member-password';
  const nextPassword = 'member-password-next';

  await page.goto('/login');
  await page.getByLabel('Имя').fill(adminName);
  await page.getByLabel('Пароль').fill(adminPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Привет, ${adminName}`) })).toBeVisible();

  await page.getByRole('button', { name: 'Включить светлую тему' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: 'Пользователи' }).click();
  await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Новый пользователь' });
  await createDialog.getByLabel('Имя').fill(memberName);
  await createDialog.getByLabel('Начальный пароль').fill(initialPassword);
  await createDialog.getByLabel('Допустимый минус, ₽').fill('500');
  await createDialog.getByRole('button', { name: 'Создать пользователя' }).click();
  await expect(page.getByText(memberName)).toBeVisible();

  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.getByLabel('Имя').fill(memberName);
  await page.getByLabel('Пароль').fill(initialPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: `Привет, ${memberName}` })).toBeVisible();
  await page.getByRole('switch', { name: 'Участие в программе' }).click();
  await expect(page.getByText('Участие на паузе')).toBeVisible();

  await page.getByRole('button', { name: 'Изменить пароль' }).click();
  const passwordDialog = page.getByRole('dialog', { name: 'Изменить пароль' });
  await passwordDialog.getByLabel('Текущий пароль').fill(initialPassword);
  await passwordDialog.getByLabel('Новый пароль', { exact: true }).fill(nextPassword);
  await passwordDialog.getByLabel('Повторите новый пароль').fill(nextPassword);
  await passwordDialog.getByRole('button', { name: 'Сохранить пароль' }).click();
  await expect(page.getByText(/Пароль изменён/)).toBeVisible();

  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.getByLabel('Имя').fill(adminName);
  await page.getByLabel('Пароль').fill(adminPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('link', { name: 'Пользователи' }).click();
  await page.getByRole('button', { name: `Редактировать ${memberName}` }).click();
  const editDialog = page.getByRole('dialog', { name: 'Настройки пользователя' });
  await editDialog.getByRole('switch', { name: 'Блокировка пользователя' }).click();
  await editDialog.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(editDialog).toBeHidden();
  const memberRow = page.locator('tbody tr').filter({ hasText: memberName });
  await expect(memberRow.getByText('Заблокирован', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.getByLabel('Имя').fill(memberName);
  await page.getByLabel('Пароль').fill(nextPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByText('Аккаунт заблокирован')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Участие в программе' })).toBeDisabled();
});
