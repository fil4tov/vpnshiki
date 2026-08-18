import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { getTariffPlans } from '#entities/tariffPlan';
import type { TariffPlan } from '#entities/tariffPlan';
import { getUsers } from '#entities/user';

import { TariffPlansPage } from '../TariffPlansPage';

vi.mock('#entities/tariffPlan', async () => {
  const actual = await vi.importActual<typeof import('#entities/tariffPlan')>('#entities/tariffPlan');
  return {
    ...actual,
    createTariffPlan: vi.fn(),
    deleteTariffPlan: vi.fn(),
    getTariffPlans: vi.fn(),
    updateTariffPlan: vi.fn(),
  };
});

vi.mock('#entities/user', async () => {
  const actual = await vi.importActual<typeof import('#entities/user')>('#entities/user');
  return { ...actual, getUsers: vi.fn() };
});

const plans: TariffPlan[] = [
  {
    id: 'current', name: 'TP_01.08.2026', monthly_amount: '1000.00',
    start_date: '2026-08-01', end_date: '2026-08-31', status: 'active', is_editable: false,
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
  },
  {
    id: 'future', name: 'TP_01.09.2026', monthly_amount: '1200.00',
    start_date: '2026-09-01', end_date: null, status: 'scheduled', is_editable: true,
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
  },
];

describe('TariffPlansPage', () => {
  it('shows statuses and protects immutable plan actions', async () => {
    vi.mocked(getTariffPlans).mockResolvedValue(plans);
    vi.mocked(getUsers).mockResolvedValue([
      {
        id: 'admin', name: 'admin', role: 'admin', balance: '0.00', negative_balance_limit: '0.00',
        total_charged: '0.00', total_top_ups: '0.00', vpnStatus: 'offline', account_status: 'active', block_source: null, created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
      },
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TariffPlansPage />
      </QueryClientProvider>,
    );

    expect(await screen.findAllByText('TP_01.08.2026')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Текущий тарифный план' })).toHaveTextContent('В сутки');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Текущий тарифный план' })).toHaveTextContent('Активных пользователей1');
    });
    expect(screen.getByText('Действует')).toBeInTheDocument();
    expect(screen.getByText('Запланирован')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Редактировать TP_01.08.2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Удалить TP_01.08.2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Редактировать TP_01.09.2026' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Удалить TP_01.09.2026' })).toBeEnabled();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('TP_01.09.2026');
    expect(rows[1]).toHaveTextContent('TP_01.08.2026');
  });
});
