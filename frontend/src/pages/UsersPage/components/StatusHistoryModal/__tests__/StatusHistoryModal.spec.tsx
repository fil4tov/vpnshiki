import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

import { getUserStatusHistory } from '#entities/user';
import type { AdminUser } from '#entities/user';

import { StatusHistoryModal } from '../StatusHistoryModal';

vi.mock('#entities/user', async () => {
  const actual = await vi.importActual<typeof import('#entities/user')>('#entities/user');
  return { ...actual, getUserStatusHistory: vi.fn() };
});

const adminUser: AdminUser = {
  id: 'user-one',
  name: 'Марина',
  role: 'user',
  balance: '100.00',
  negative_balance_limit: '500.00',
  total_charged: '96.78',
  vpnStatus: 'online',
  account_status: 'active',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-16T11:32:00Z',
};

describe('StatusHistoryModal', () => {
  it('shows transitions, causes and actors in reverse chronological order', async () => {
    vi.mocked(getUserStatusHistory).mockResolvedValue([
      {
        id: 'top-up', previous_status: 'blocked', new_status: 'active',
        changed_by_user_id: null, changed_by_name: null, source: 'top_up',
        effective_at: '2026-08-16T11:32:00Z',
      },
      {
        id: 'billing', previous_status: 'active', new_status: 'blocked',
        changed_by_user_id: null, changed_by_name: null, source: 'billing',
        effective_at: '2026-08-12T21:00:00Z',
      },
      {
        id: 'admin', previous_status: 'paused', new_status: 'active',
        changed_by_user_id: 'admin-one', changed_by_name: 'admin', source: 'admin',
        effective_at: '2026-08-07T07:18:00Z',
      },
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <StatusHistoryModal user={adminUser} onClose={() => undefined} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Баланс снова в допустимых пределах')).toBeInTheDocument();
    expect(screen.getByText('Аккаунт работает без ограничений')).toBeInTheDocument();
    expect(screen.getByText('с 16 августа')).toBeInTheDocument();
    expect(screen.getByText('Превышен допустимый минус')).toBeInTheDocument();
    expect(screen.getByText('Изменил admin')).toBeInTheDocument();

    const events = screen.getAllByRole('article');
    expect(within(events[0]).getByText('пополнение')).toBeInTheDocument();
    expect(within(events[0]).getByText('16.08.2026')).toBeInTheDocument();
    expect(within(events[0]).getByText('14:32')).toBeInTheDocument();
    expect(within(events[1]).getByText('биллинг')).toBeInTheDocument();
    expect(within(events[2]).getByText('админ')).toBeInTheDocument();
  });
});
