import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { getMyTopUps, getUserTopUps } from '../../../api';

import { TopUpHistoryModal } from '../TopUpHistoryModal';

vi.mock('../../../api', async () => {
  const actual = await vi.importActual<typeof import('../../../api')>('../../../api');
  return { ...actual, getMyTopUps: vi.fn(), getUserTopUps: vi.fn() };
});

const subject = { id: 'user-one', name: 'moxxie' };

function renderModal(mode: 'self' | 'admin', total?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TopUpHistoryModal
        user={subject}
        mode={mode}
        total={total}
        onClose={() => undefined}
      />
    </QueryClientProvider>,
  );
}

describe('TopUpHistoryModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups top-ups by Moscow month and displays only date and amount columns', async () => {
    vi.mocked(getUserTopUps).mockResolvedValue([
      { id: 'august', amount: '50.00', created_at: '2026-07-31T21:00:00Z' },
      { id: 'july', amount: '100.00', created_at: '2026-07-30T21:00:00Z' },
    ]);
    const user = userEvent.setup();
    renderModal('admin', '150.00');

    expect(await screen.findAllByText('1 пополнение')).toHaveLength(2);
    expect(getUserTopUps).toHaveBeenCalledWith('user-one');
    expect(screen.getByText('+150,00 ₽')).toBeInTheDocument();
    expect(screen.getByText('Дата')).toBeInTheDocument();
    expect(screen.getByText('Сумма')).toBeInTheDocument();
    expect(screen.queryByText('Тарифный план')).not.toBeInTheDocument();
    expect(screen.getAllByText('+50,00 ₽')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /Июль 2026/i }));
    expect(screen.getAllByText('+100,00 ₽')).toHaveLength(2);
    expect(screen.getAllByText('+50,00 ₽')).toHaveLength(1);
  });

  it('uses the self endpoint and renders the empty state', async () => {
    vi.mocked(getMyTopUps).mockResolvedValue([]);
    renderModal('self');

    expect(await screen.findByText('У пользователя пока не было пополнений.')).toBeInTheDocument();
    expect(getMyTopUps).toHaveBeenCalledOnce();
    expect(screen.getByText('+0,00 ₽')).toBeInTheDocument();
  });

  it('renders a retry state when history cannot be loaded', async () => {
    vi.mocked(getMyTopUps).mockRejectedValue(new Error('offline'));
    renderModal('self');

    expect(await screen.findByText('Не удалось загрузить историю пополнений.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});
