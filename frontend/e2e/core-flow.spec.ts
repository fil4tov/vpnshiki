import { createHmac } from 'node:crypto';

import { expect, test } from '@playwright/test';

function signYooMoneyNotification(params: Record<string, string>) {
  const canonical = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return createHmac('sha256', 'e2e-notification-secret').update(canonical).digest('hex');
}

function moscowDateWithOffset(offset: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const value = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offset));
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function displayDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function planName(value: string) {
  return `TP_${displayDate(value)}`;
}

test('administrator manages a user account until deletion', async ({ page }) => {
  const adminName = process.env.E2E_ADMIN_NAME ?? 'admin';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'change_me_now';
  const adminMobileProfile = `${adminName}-mobile`;
  const adminPcProfile = `${adminName}-pc`;
  const memberName = 'Участник-e2e';
  const initialPassword = 'member-password';
  const nextPassword = 'member-password-next';
  const logout = async () => {
    await page.getByRole('button', { name: 'Открыть меню пользователя' }).click();
    await page.getByRole('menuitem', { name: 'Выйти' }).click();
  };

  await page.goto('/login');
  await page.getByLabel('Имя').fill(adminName);
  await page.getByLabel('Пароль', { exact: true }).fill(adminPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Привет, ${adminName}`) })).toBeVisible();

  const vpnSection = page.getByRole('region', { name: 'Ваш VPN' });
  const subscriptionCard = vpnSection.getByRole('article', { name: 'Единая подписка' });
  await expect(subscriptionCard).toBeVisible();
  const profileTabs = vpnSection.getByRole('tablist', { name: 'VPN-профили' });
  await expect(profileTabs.getByRole('tab', { name: adminMobileProfile })).toHaveAttribute('aria-selected', 'true');
  await vpnSection.getByRole('button', { name: 'Показать отдельные подключения' }).click();
  await expect(vpnSection.getByText(`ru-fin-vless-443-web-${adminMobileProfile}`)).toBeVisible();
  await expect(vpnSection.getByText('VLESS', { exact: true })).toBeVisible();
  await expect(vpnSection.getByText('Hysteria2', { exact: true })).toBeVisible();
  await subscriptionCard.getByRole('button', { name: 'Скопировать ссылку' }).click();
  await expect(page.getByRole('status')).toContainText('Ссылка скопирована');
  await subscriptionCard.getByRole('button', { name: 'Показать QR общей подписки' }).click();
  await expect(page.getByRole('dialog', { name: `Общая подписка — ${adminMobileProfile}` })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await profileTabs.getByRole('tab', { name: adminPcProfile }).click();
  await expect(profileTabs.getByRole('tab', { name: adminPcProfile })).toHaveAttribute('aria-selected', 'true');
  await expect(vpnSection.getByText(`ru-fin-vless-443-web-${adminPcProfile}`)).toBeVisible();
  await expect(vpnSection.getByText(`ru-fin-vless-443-web-${adminMobileProfile}`)).toHaveCount(0);
  await subscriptionCard.getByRole('button', { name: 'Показать QR общей подписки' }).click();
  await expect(page.getByRole('dialog', { name: `Общая подписка — ${adminPcProfile}` })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть' }).click();

  await page.getByRole('button', { name: 'Включить светлую тему' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: 'Админ-панель' }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Новый пользователь' });
  await createDialog.getByLabel('Имя').fill(memberName);
  await createDialog.getByLabel('Начальный пароль').fill(initialPassword);
  await createDialog.getByLabel('Допустимый минус, ₽').fill('500');
  await createDialog.getByRole('combobox', { name: 'Статус аккаунта' }).click();
  await page.getByRole('option', { name: 'Приостановлен' }).click();
  await createDialog.getByRole('button', { name: 'Создать пользователя' }).click();
  await expect(page.getByText(memberName)).toBeVisible();

  await logout();
  let blockedVpnRequests = 0;
  const countBlockedVpnRequests = (request: { url(): string }) => {
    if (request.url().endsWith('/api/users/me/vpn')) blockedVpnRequests += 1;
  };
  page.on('request', countBlockedVpnRequests);
  await page.getByLabel('Имя').fill(memberName);
  await page.getByLabel('Пароль', { exact: true }).fill(initialPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: `Привет, ${memberName}` })).toBeVisible();
  const accountCard = page.getByRole('region', { name: 'Статус участия и баланс' });
  await expect(accountCard).toContainText('Аккаунт приостановлен');
  await expect(accountCard.getByText('Суточное списание')).toHaveCount(0);
  await accountCard.getByRole('switch', { name: 'Активировать аккаунт' }).click();
  await expect(accountCard).toContainText('Аккаунт активен');
  await expect(accountCard.getByText('Суточное списание')).toBeVisible();

  await page.getByRole('button', { name: 'Пополнить' }).click();
  const topUpDialog = page.getByRole('dialog', { name: 'Пополнить баланс' });
  await topUpDialog.getByLabel('Сумма платежа, ₽').fill('25.50');
  await topUpDialog.getByRole('button', { name: 'Продолжить' }).click();
  await expect(topUpDialog.getByText(/25[\s\u00a0]*,50/)).toBeVisible();
  let checkoutBody = '';
  await page.route('https://yoomoney.ru/quickpay/confirm', async (route) => {
    checkoutBody = route.request().postData() ?? '';
    await route.fulfill({ contentType: 'text/html', body: '<h1>YooMoney test checkout</h1>' });
  });
  await topUpDialog.getByRole('button', { name: 'Перейти к оплате' }).click();
  await expect(page.getByRole('heading', { name: 'YooMoney test checkout' })).toBeVisible();
  const checkout = new URLSearchParams(checkoutBody);
  expect(checkout.get('label')).toMatch(/^pay_[0-9a-f]{32}$/);
  expect(checkout.get('paymentType')).toBe('AC');
  expect(checkout.get('sum')).toBe('25.50');
  const notification: Record<string, string> = {
    notification_type: 'p2p-incoming',
    operation_id: 'e2e-top-up-operation',
    amount: '25.25',
    withdraw_amount: '25.50',
    currency: '643',
    datetime: new Date().toISOString(),
    sender: '',
    codepro: 'false',
    label: checkout.get('label') ?? '',
    unaccepted: 'false',
  };
  notification.sign = signYooMoneyNotification(notification);
  const firstWebhook = await page.request.post('/api/payments/yoomoney/webhook', {
    form: notification,
  });
  expect(firstWebhook.ok()).toBe(true);
  const duplicateWebhook = await page.request.post('/api/payments/yoomoney/webhook', {
    form: notification,
  });
  expect(duplicateWebhook.ok()).toBe(true);
  const successUrl = checkout.get('successURL');
  expect(successUrl).toBeTruthy();
  await page.goto(new URL(successUrl!).pathname);
  await expect(page.getByRole('heading', { name: 'Баланс пополнен' })).toBeVisible();
  await expect(page.getByText(/25[\s\u00a0]*,25/)).toBeVisible();
  await page.getByRole('button', { name: 'Вернуться на главную' }).click();
  await expect(page.getByRole('region', { name: 'Статус участия и баланс' })).toContainText(/25[\s\u00a0]*,25/);

  await page.getByRole('button', { name: 'Открыть меню пользователя' }).click();
  await page.getByRole('menuitem', { name: 'Сменить пароль' }).click();
  const passwordDialog = page.getByRole('dialog', { name: 'Изменить пароль' });
  await passwordDialog.getByLabel('Текущий пароль').fill(initialPassword);
  await passwordDialog.getByLabel('Новый пароль', { exact: true }).fill(nextPassword);
  await passwordDialog.getByLabel('Повторите новый пароль').fill(nextPassword);
  await passwordDialog.getByRole('button', { name: 'Сохранить пароль' }).click();
  await expect(page.getByText(/Пароль изменён/)).toBeVisible();

  await logout();
  await page.getByLabel('Имя').fill(adminName);
  await page.getByLabel('Пароль', { exact: true }).fill(adminPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('link', { name: 'Админ-панель' }).click();
  await page.getByRole('button', { name: `Редактировать ${memberName}` }).click();
  const editDialog = page.getByRole('dialog', { name: 'Настройки пользователя' });
  await editDialog.getByRole('combobox', { name: 'Статус аккаунта' }).click();
  await page.getByRole('option', { name: 'Заблокирован' }).click();
  await editDialog.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(editDialog).toBeHidden();
  const memberRow = page.locator('tbody tr').filter({ hasText: memberName });
  await expect(memberRow.getByText('Заблокирован', { exact: true })).toBeVisible();
  await expect(memberRow.getByText('Не в сети', { exact: true })).toBeVisible();

  await memberRow.getByRole('button', { name: `Открыть историю статуса ${memberName}` }).click();
  const statusHistoryDialog = page.getByRole('dialog', { name: 'История статуса' });
  const manualBlockEvent = statusHistoryDialog.getByRole('article').filter({
    hasText: 'Аккаунт заблокирован вручную',
  });
  await expect(manualBlockEvent).toBeVisible();
  await expect(manualBlockEvent.getByText(`Изменил ${adminName}`)).toBeVisible();
  await expect(statusHistoryDialog.getByText('Аккаунт активирован пользователем')).toBeVisible();
  await expect(statusHistoryDialog.getByText(`Активировал ${memberName}`)).toBeVisible();
  await statusHistoryDialog.getByRole('button', { name: 'Закрыть' }).click();

  blockedVpnRequests = 0;
  await logout();
  await page.getByLabel('Имя').fill(memberName);
  await page.getByLabel('Пароль', { exact: true }).fill(nextPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByText('Аккаунт заблокирован')).toBeVisible();
  await expect(page.getByText('VPN доступен только для активного аккаунта')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Активировать аккаунт' })).toHaveCount(0);
  expect(blockedVpnRequests).toBe(0);
  page.off('request', countBlockedVpnRequests);

  await logout();
  await page.getByLabel('Имя').fill(adminName);
  await page.getByLabel('Пароль', { exact: true }).fill(adminPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('link', { name: 'Админ-панель' }).click();
  const deleteRow = page.locator('tbody tr').filter({ hasText: memberName });
  await deleteRow.getByRole('button', { name: `Удалить ${memberName}` }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Удалить пользователя' });
  await expect(deleteDialog.getByText(`Удалить аккаунт ${memberName}?`)).toBeVisible();
  await deleteDialog.getByRole('button', { name: 'Удалить пользователя' }).click();
  await expect(deleteDialog).toBeHidden();
  await expect(deleteRow).toBeHidden();
});

test('administrator maintains a continuous tariff plan schedule', async ({ page }) => {
  const adminName = process.env.E2E_ADMIN_NAME ?? 'admin';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'change_me_now';
  const initialStart = moscowDateWithOffset(-1);
  const futureStart = moscowDateWithOffset(10);
  const movedStart = moscowDateWithOffset(12);

  await page.goto('/login');
  await page.getByLabel('Имя').fill(adminName);
  await page.getByLabel('Пароль', { exact: true }).fill(adminPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('link', { name: 'Админ-панель' }).click();
  await page.getByRole('link', { name: 'Тарифные планы' }).click();
  await expect(page).toHaveURL(/\/admin\/tariff-plans$/);
  await expect(page.getByRole('heading', { name: 'Тарифные планы' })).toBeVisible();

  await page.getByRole('button', { name: 'Добавить' }).click();
  const firstDialog = page.getByRole('dialog', { name: 'Новый тарифный план' });
  await firstDialog.getByLabel('Сумма за месяц, ₽').fill('1000.50');
  await firstDialog.getByLabel('Дата начала').fill(initialStart);
  await expect(firstDialog.getByLabel('Название')).toHaveValue(planName(initialStart));
  await firstDialog.getByRole('button', { name: 'Создать план' }).click();
  await expect(firstDialog).toBeHidden();
  const currentPlanCard = page.getByRole('region', { name: 'Текущий тарифный план' });
  await expect(currentPlanCard).toContainText(planName(initialStart));
  await expect(currentPlanCard).toContainText('В сутки');
  await expect(currentPlanCard).toContainText('Активных пользователей');

  await page.getByRole('button', { name: 'Добавить' }).click();
  const futureDialog = page.getByRole('dialog', { name: 'Новый тарифный план' });
  await futureDialog.getByLabel('Сумма за месяц, ₽').fill('1200');
  await futureDialog.getByLabel('Дата начала').fill(futureStart);
  await futureDialog.getByRole('button', { name: 'Создать план' }).click();
  await expect(futureDialog).toBeHidden();

  const initialRow = page.locator('tbody tr').filter({ hasText: planName(initialStart) });
  await expect(initialRow.getByText(displayDate(moscowDateWithOffset(9)))).toBeVisible();
  const futureRow = page.locator('tbody tr').filter({ hasText: planName(futureStart) });
  await expect(futureRow.getByText('Запланирован')).toBeVisible();

  await futureRow.getByRole('button', { name: `Редактировать ${planName(futureStart)}` }).click();
  const editDialog = page.getByRole('dialog', { name: 'Изменить тарифный план' });
  await editDialog.getByLabel('Сумма за месяц, ₽').fill('1250.25');
  await editDialog.getByLabel('Дата начала').fill(movedStart);
  await editDialog.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(editDialog).toBeHidden();

  const movedRow = page.locator('tbody tr').filter({ hasText: planName(movedStart) });
  await expect(movedRow).toContainText(/1\s*250,25/);
  await movedRow.getByRole('button', { name: `Удалить ${planName(movedStart)}` }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Удалить тарифный план' });
  await deleteDialog.getByRole('button', { name: 'Удалить план' }).click();
  await expect(deleteDialog).toBeHidden();
  await expect(initialRow.getByText('Бессрочно')).toBeVisible();
});

test('administrator inspects top-up operations', async ({ page }) => {
  const adminName = process.env.E2E_ADMIN_NAME ?? 'admin';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'change_me_now';

  await page.goto('/login');
  await page.getByLabel('Имя').fill(adminName);
  await page.getByLabel('Пароль', { exact: true }).fill(adminPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Привет, ${adminName}`) })).toBeVisible();
  const paymentResponse = await page.request.post('/api/users/me/top-up-payments', {
    data: { amount: '10.00' },
  });
  expect(paymentResponse.ok()).toBe(true);
  const payment = await paymentResponse.json() as { id: string };
  await page.getByRole('link', { name: 'Админ-панель' }).click();
  await page.getByRole('link', { name: 'Пополнения' }).click();
  await expect(page).toHaveURL(/\/admin\/top-ups$/);

  await expect(page.getByRole('heading', { name: 'Журнал операций' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: `Показать детали платежа ${payment.id}` }).click();
  await expect(page.getByText('Label YooMoney')).toBeVisible();
  await expect(page.getByText('Последняя проверка')).toBeVisible();
});
