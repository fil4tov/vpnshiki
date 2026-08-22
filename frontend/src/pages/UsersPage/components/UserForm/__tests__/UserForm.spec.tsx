import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import type { AdminUser } from '#entities/user';

import { UserForm } from '../UserForm';

describe('UserForm', () => {
  it('generates and reveals an initial password for a new user', async () => {
    const user = userEvent.setup();
    render(<UserForm onCancel={() => undefined} onSubmit={() => Promise.resolve()} />);

    await user.click(screen.getByRole('button', { name: 'Сгенерировать пароль' }));

    const password = screen.getByLabelText('Начальный пароль');
    expect(screen.getByLabelText('Имя')).toHaveAttribute('placeholder', 'username');
    expect(screen.getByLabelText('Telegram User ID')).not.toHaveAttribute('placeholder');
    expect(screen.getByLabelText('Допустимый минус, ₽')).toHaveValue(300);
    expect(password).not.toHaveValue('');
    expect(password).toHaveAttribute('type', 'text');
  });

  it('submits one account status instead of separate activity flags', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<UserForm onCancel={() => undefined} onSubmit={onSubmit} />);

    const accountStatus = screen.getByRole('combobox', { name: 'Статус аккаунта' });
    const role = screen.getByRole('combobox', { name: 'Роль' });
    expect(accountStatus.compareDocumentPosition(role) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(screen.getByLabelText('Имя'), 'Антон');
    await user.type(screen.getByLabelText('Начальный пароль'), 'strong-password');
    await user.click(screen.getByRole('combobox', { name: 'Статус аккаунта' }));
    await user.click(screen.getByRole('option', { name: 'Приостановлен' }));
    expect(screen.getByText('Участие и ежедневные списания приостановлены')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Создать пользователя' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const payload = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.account_status).toBe('paused');
    expect(payload).not.toHaveProperty('is_active');
    expect(payload).not.toHaveProperty('is_blocked');
    expect(payload.tgUserId).toBeNull();
  });

  it('submits and clears the admin-only Telegram user ID', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const existingUser: AdminUser = {
      id: 'user-id',
      name: 'Антон',
      balance: '10.00',
      negative_balance_limit: '300.00',
      role: 'user',
      account_status: 'active',
      block_source: null,
      created_at: '2026-08-22T00:00:00Z',
      updated_at: '2026-08-22T00:00:00Z',
      tgUserId: '258373830',
      total_charged: '0.00',
      total_top_ups: '0.00',
      vpnProfiles: [],
    };
    const { rerender } = render(
      <UserForm user={existingUser} onCancel={() => undefined} onSubmit={onSubmit} />,
    );

    const telegramId = screen.getByLabelText('Telegram User ID');
    expect(telegramId).toHaveValue('258373830');
    await user.clear(telegramId);
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ tgUserId: null }),
    ));

    rerender(<UserForm onCancel={() => undefined} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Telegram User ID'), 'invalid-id');
    await user.click(screen.getByRole('button', { name: 'Создать пользователя' }));
    expect(await screen.findByText('ID должен содержать только цифры')).toBeInTheDocument();
  });
});
