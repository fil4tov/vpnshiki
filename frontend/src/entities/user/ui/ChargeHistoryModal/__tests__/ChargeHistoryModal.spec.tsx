import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { getMyCharges, getUserCharges } from '../../../api';

import { ChargeHistoryModal } from '../ChargeHistoryModal';

vi.mock('../../../api', async () => {
  const actual = await vi.importActual<typeof import('../../../api')>('../../../api');
  return { ...actual, getMyCharges: vi.fn(), getUserCharges: vi.fn() };
});

const subject = { id: 'user-one', name: 'moxxie' };

function renderModal(mode: 'self' | 'admin', total?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChargeHistoryModal
        user={subject}
        mode={mode}
        total={total}
        onClose={() => undefined}
      />
    </QueryClientProvider>,
  );
}

describe('ChargeHistoryModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the admin history and groups charges by Moscow month', async () => {
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
    const user = userEvent.setup();
    renderModal('admin', '96.78');

    expect(await screen.findByText('TP_01.08.2026')).toBeInTheDocument();
    expect(getUserCharges).toHaveBeenCalledWith('user-one');
    expect(getMyCharges).not.toHaveBeenCalled();
    expect(screen.getByText('96,78 ₽')).toBeInTheDocument();
    expect(screen.getByText('Дата')).toBeInTheDocument();
    expect(screen.getByText('Тарифный план')).toBeInTheDocument();
    expect(screen.getByText('Сумма')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Июль 2026/i }));
    expect(screen.getByText('TP_01.07.2026')).toBeInTheDocument();
    expect(screen.queryByText('TP_01.08.2026')).not.toBeInTheDocument();
  });

  it('uses the self endpoint and shows an empty history', async () => {
    vi.mocked(getMyCharges).mockResolvedValue([]);
    renderModal('self');

    expect(await screen.findByText('У пользователя пока не было списаний.')).toBeInTheDocument();
    expect(getMyCharges).toHaveBeenCalledOnce();
    expect(screen.getByText('0,00 ₽')).toBeInTheDocument();
  });
});
