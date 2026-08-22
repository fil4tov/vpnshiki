import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    id: 'online', name: 'online-user', role: 'user', account_status: 'paused',
    tgUserId: '258373830',
    block_source: null,
    balance: '-10.00', negative_balance_limit: '500.00', total_charged: '10.00', total_top_ups: '5.00',
    vpnProfiles: [
      { enabled: false, label: 'online-user-mobile', status: 'online' },
      { enabled: true, label: 'online-user-PC', status: 'offline' },
    ],
    created_at: createdAt, updated_at: createdAt,
  },
  {
    id: 'offline', name: 'offline-user', role: 'user', account_status: 'blocked',
    tgUserId: null,
    block_source: 'admin',
    balance: '100.00', negative_balance_limit: '100.00', total_charged: '30.00', total_top_ups: '15.00',
    vpnProfiles: [], created_at: createdAt, updated_at: createdAt,
  },
  {
    id: 'unknown', name: 'unknown-user', role: 'user', account_status: 'active',
    tgUserId: null,
    block_source: null,
    balance: '0.00', negative_balance_limit: '1000.00', total_charged: '20.00', total_top_ups: '10.00',
    vpnProfiles: null, created_at: createdAt, updated_at: createdAt,
  },
];

describe('UsersPage', () => {
  it('shows VPN profile counts and accessible profile details after the account status column', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(getUsers).mockResolvedValue(users);
    useUserStore.setState({
      user: {
        id: 'admin', name: 'admin', role: 'admin', account_status: 'active',
        block_source: null,
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
    const headers = within(header).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers.slice(0, 4)).toEqual(['ID', 'Пользователь', 'Статус', 'VPN']);
    expect(headers.slice(-2)).toEqual(['TG ID', 'Действия']);
    expect(headers).not.toContain('История списаний');
    const onlineRow = within(screen.getByText('online-user').closest('tr')!);
    const copyIdButton = onlineRow.getByRole('button', {
      name: 'Скопировать ID пользователя online-user',
    });
    expect(copyIdButton.closest('td')).toHaveAttribute('data-label', 'ID');
    await userEvent.click(copyIdButton);
    expect(writeText).toHaveBeenCalledWith('online');
    expect(copyIdButton).toHaveAttribute('data-copy-state', 'copied');
    const profilesTrigger = onlineRow.getByRole('button', {
      name: '2 VPN-профиля у пользователя online-user',
    });
    expect(profilesTrigger).toHaveTextContent('2');
    await userEvent.hover(profilesTrigger);
    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText('Профили пользователя')).toBeInTheDocument();
    expect(within(tooltip).getByText('online-user-mobile')).toBeInTheDocument();
    expect(within(tooltip).getByText('online-user-PC')).toBeInTheDocument();
    expect(within(tooltip).getByLabelText('В сети')).toBeInTheDocument();
    expect(within(tooltip).getByLabelText('Не в сети')).toBeInTheDocument();
    const mobileProfile = within(tooltip).getByText('online-user-mobile').closest('li')!;
    const pcProfile = within(tooltip).getByText('online-user-PC').closest('li')!;
    expect(within(mobileProfile).getByText('В сети')).toBeInTheDocument();
    expect(within(pcProfile).getByText('Не в сети')).toBeInTheDocument();
    expect(within(mobileProfile).getByLabelText('Профиль выключен')).toHaveTextContent('Выключен');
    expect(within(pcProfile).getByLabelText('Профиль включён')).toHaveTextContent('Включён');
    const historyButton = onlineRow.getByRole('button', {
      name: 'Открыть историю списаний online-user',
    });
    expect(historyButton).toHaveTextContent('');
    expect(historyButton.closest('td')).toHaveAttribute('data-label', 'Всего списаний');
    const topUpHistoryButton = onlineRow.getByRole('button', {
      name: 'Открыть историю пополнений online-user',
    });
    expect(topUpHistoryButton).toHaveTextContent('');
    expect(topUpHistoryButton.closest('td')).toHaveAttribute('data-label', 'Всего пополнений');
    const telegramId = onlineRow.getByText('258373830');
    expect(telegramId.closest('td')).toHaveAttribute('data-label', 'TG ID');
    expect(within(screen.getByText('offline-user').closest('tr')!).getByText('—')).toBeInTheDocument();
    const statusHistoryButton = onlineRow.getByRole('button', {
      name: 'Открыть историю статуса online-user',
    });
    expect(statusHistoryButton).toHaveTextContent('');
    expect(statusHistoryButton.closest('td')).toHaveAttribute('data-label', 'Статус');
    expect(screen.queryByText('Открыть')).not.toBeInTheDocument();
    const emptyTrigger = within(screen.getByText('offline-user').closest('tr')!).getByRole('button', {
      name: 'Нет VPN-профилей у пользователя offline-user',
    });
    await userEvent.unhover(profilesTrigger);
    await userEvent.hover(emptyTrigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('VPN-профили не найдены');
    const unavailableTrigger = within(screen.getByText('unknown-user').closest('tr')!).getByRole('button', {
      name: 'Данные VPN-профилей пользователя unknown-user недоступны',
    });
    await userEvent.unhover(emptyTrigger);
    await userEvent.hover(unavailableTrigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Не удалось получить данные из VPN-панели',
    );
  });

  it('sorts users by every data column and toggles the direction', async () => {
    vi.mocked(getUsers).mockResolvedValue(users);
    useUserStore.setState({
      user: {
        id: 'admin', name: 'admin', role: 'admin', account_status: 'active',
        block_source: null,
        balance: '0.00', negative_balance_limit: '500.00',
        created_at: createdAt, updated_at: createdAt,
      },
      status: 'authenticated',
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <UsersPage />
      </QueryClientProvider>,
    );

    await screen.findByText('online-user');
    const rowNames = () => screen.getAllByRole('row').slice(1).map((row) =>
      within(row).getByText(/^(online|offline|unknown)-user$/).textContent,
    );
    const descendingOrders: Array<[string, string[]]> = [
      ['Пользователь', ['offline-user', 'online-user', 'unknown-user']],
      ['Статус', ['online-user', 'offline-user', 'unknown-user']],
      ['VPN', ['online-user', 'offline-user', 'unknown-user']],
      ['Баланс', ['offline-user', 'unknown-user', 'online-user']],
      ['Лимит', ['unknown-user', 'online-user', 'offline-user']],
      ['Всего списаний', ['offline-user', 'unknown-user', 'online-user']],
      ['Всего пополнений', ['offline-user', 'unknown-user', 'online-user']],
    ];

    for (const [label, order] of descendingOrders) {
      const sortButton = screen.getByRole('button', { name: label });
      await user.click(sortButton);
      expect(sortButton.closest('th')).toHaveAttribute('aria-sort', 'descending');
      expect(rowNames()).toEqual(order);
    }

    const totalTopUpsSort = screen.getByRole('button', { name: 'Всего пополнений' });
    await user.click(totalTopUpsSort);
    expect(totalTopUpsSort.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    expect(rowNames()).toEqual(['online-user', 'unknown-user', 'offline-user']);

    await user.click(totalTopUpsSort);
    expect(totalTopUpsSort.closest('th')).toHaveAttribute('aria-sort', 'none');
    expect(rowNames()).toEqual(['online-user', 'offline-user', 'unknown-user']);

    const telegramIdSort = screen.getByRole('button', { name: 'TG ID' });
    await user.click(telegramIdSort);
    expect(telegramIdSort.closest('th')).toHaveAttribute('aria-sort', 'descending');
    expect(rowNames()).toEqual(['online-user', 'offline-user', 'unknown-user']);
  });
});
