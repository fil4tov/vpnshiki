import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

import { getUsers, useUserStore } from '#entities/user';
import type { AdminUser } from '#entities/user';

import { UsersPage } from '../UsersPage';

vi.mock('#entities/user', async () => {
  const actual = await vi.importActual<typeof import('#entities/user')>('#entities/user');
  return { ...actual, getUsers: vi.fn() };
});

const createdAt = '2026-08-16T00:00:00Z';
const users: AdminUser[] = [
  {
    id: 'online', name: 'online-user', role: 'user', account_status: 'active',
    balance: '0.00', negative_balance_limit: '500.00', total_charged: '10.00',
    vpnStatus: 'online', created_at: createdAt, updated_at: createdAt,
  },
  {
    id: 'offline', name: 'offline-user', role: 'user', account_status: 'active',
    balance: '0.00', negative_balance_limit: '500.00', total_charged: '10.00',
    vpnStatus: 'offline', created_at: createdAt, updated_at: createdAt,
  },
  {
    id: 'unknown', name: 'unknown-user', role: 'user', account_status: 'active',
    balance: '0.00', negative_balance_limit: '500.00', total_charged: '10.00',
    vpnStatus: 'unknown', created_at: createdAt, updated_at: createdAt,
  },
];

describe('UsersPage', () => {
  it('shows VPN status after the account status column', async () => {
    vi.mocked(getUsers).mockResolvedValue(users);
    useUserStore.setState({
      user: {
        id: 'admin', name: 'admin', role: 'admin', account_status: 'active',
        balance: '0.00', negative_balance_limit: '500.00',
        created_at: createdAt, updated_at: createdAt,
      },
      status: 'authenticated',
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <UsersPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('online-user')).toBeInTheDocument();
    const header = screen.getAllByRole('row')[0];
    expect(within(header).getAllByRole('columnheader').slice(0, 3).map((cell) => cell.textContent))
      .toEqual(['Пользователь', 'Статус', 'VPN']);
    expect(within(screen.getByText('online-user').closest('tr')!).getByText('В сети'))
      .toBeInTheDocument();
    expect(within(screen.getByText('offline-user').closest('tr')!).getByText('Не в сети'))
      .toBeInTheDocument();
    expect(within(screen.getByText('unknown-user').closest('tr')!).getByText('Неизвестно'))
      .toBeInTheDocument();
  });
});
