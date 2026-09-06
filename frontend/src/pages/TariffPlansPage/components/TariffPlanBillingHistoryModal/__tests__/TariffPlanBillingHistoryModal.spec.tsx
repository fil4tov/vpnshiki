import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { getTariffPlanBillingHistory } from '#entities/tariffPlan';
import type { TariffPlan } from '#entities/tariffPlan';

import { TariffPlanBillingHistoryModal } from '../TariffPlanBillingHistoryModal';

vi.mock('#entities/tariffPlan', async () => {
  const actual = await vi.importActual<typeof import('#entities/tariffPlan')>(
    '#entities/tariffPlan',
  );
  return { ...actual, getTariffPlanBillingHistory: vi.fn() };
});

const plan: TariffPlan = {
  id: 'plan-one',
  name: 'TP_01.08.2026',
  monthly_amount: '2000.00',
  start_date: '2026-08-01',
  end_date: null,
  status: 'active',
  is_editable: false,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

describe('TariffPlanBillingHistoryModal', () => {
  it('shows users, per-user charge, and total daily charge grouped by month', async () => {
    vi.mocked(getTariffPlanBillingHistory).mockResolvedValue([
      {
        id: 'august', billing_date: '2026-08-16', daily_charge: '32.26',
        active_users_count: 2, tarification_total: '64.52',
        additional_profiles_total: '16.13', total_charged: '80.65',
      },
      {
        id: 'july', billing_date: '2026-07-31', daily_charge: '64.52',
        active_users_count: 1, tarification_total: '64.52',
        additional_profiles_total: '0.00', total_charged: '64.52',
      },
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <TariffPlanBillingHistoryModal plan={plan} onClose={() => undefined} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('2 пользователя')).toBeInTheDocument();
    expect(screen.getByText('16 августа')).toHaveAttribute('data-label', 'Дата');
    expect(screen.getByText('2 пользователя')).toHaveAttribute('data-label', 'Пользователи');
    const title = screen.getByRole('heading', { name: 'История списаний' });
    const planName = screen.getByText('TP_01.08.2026');
    expect(title.compareDocumentPosition(planName) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Списано за всё время')).toBeInTheDocument();
    expect(screen.getByText('145,17 ₽')).toBeInTheDocument();
    const headers = [
      'Дата',
      'Пользователи',
      'Тарификация',
      'Общая тарификация',
      'Доп. профили',
      'Всего списано',
    ];
    const firstHeader = screen.getByText(headers[0]).parentElement;
    expect(firstHeader).not.toBeNull();
    expect(within(firstHeader as HTMLElement).getAllByText(/.+/).map((cell) => cell.textContent)).toEqual(
      headers,
    );
    expect(screen.getByText('−32,26 ₽')).toBeInTheDocument();
    expect(screen.getByText('−64,52 ₽', { selector: '[data-label="Общая тарификация"]' }))
      .toBeInTheDocument();
    expect(screen.getByText('−16,13 ₽', { selector: '[data-label="Доп. профили"]' }))
      .toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Август 2026/i })).getByText('−80,65 ₽'))
      .toBeInTheDocument();
    expect(screen.getByText('−80,65 ₽', { selector: '[data-label="Всего списано"]' }))
      .toBeInTheDocument();
    expect(screen.queryByText('1 пользователь')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Июль 2026/i }));
    expect(screen.getByText('1 пользователь')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Июль 2026/i })).getByText('−64,52 ₽'))
      .toBeInTheDocument();
    expect(screen.queryByText('2 пользователя')).not.toBeInTheDocument();
  });
});
