import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { getUserCharges } from '#entities/user';
import type { AdminUser } from '#entities/user';

import { ChargeHistoryModal } from '../ChargeHistoryModal';

vi.mock('#entities/user', async () => {
  const actual = await vi.importActual<typeof import('#entities/user')>('#entities/user');
  return { ...actual, getUserCharges: vi.fn() };
});

const adminUser: AdminUser = {
  id: 'user-one',
  name: 'moxxie',
  role: 'admin',
  balance: '0.00',
  negative_balance_limit: '500.00',
  total_charged: '96.78',
  vpnStatus: 'online',
  account_status: 'active',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

describe('ChargeHistoryModal', () => {
  it('groups charges by Moscow month and expands the newest period first', async () => {
    vi.mocked(getUserCharges).mockResolvedValue([
      {
        id: 'august', amount: '32.26', tariff_plan_id: 'plan-august',
        tariff_plan_name: 'TP_01.08.2026', created_at: '2026-08-15T21:00:00Z',
      },
      {
        id: 'july', amount: '64.52', tariff_plan_id: 'plan-july',
        tariff_plan_name: 'TP_01.07.2026', created_at: '2026-07-30T21:00:00Z',
      },
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <ChargeHistoryModal user={adminUser} onClose={() => undefined} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('TP_01.08.2026')).toBeInTheDocument();
    const title = screen.getByRole('heading', { name: 'История списаний' });
    const userName = screen.getByText('moxxie');
    expect(title.compareDocumentPosition(userName) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('96,78 ₽')).toBeInTheDocument();
    const headers = ['Дата', 'Тарифный план', 'Сумма'];
    const firstHeader = screen.getByText(headers[0]).parentElement;
    expect(firstHeader).not.toBeNull();
    expect(within(firstHeader as HTMLElement).getAllByText(/.+/).map((cell) => cell.textContent)).toEqual(
      headers,
    );
    expect(screen.queryByText('TP_01.07.2026')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Июль 2026/i }));
    expect(screen.getByText('TP_01.07.2026')).toBeInTheDocument();
    expect(screen.queryByText('TP_01.08.2026')).not.toBeInTheDocument();
  });
});
