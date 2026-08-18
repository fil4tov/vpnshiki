import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import {
  getYooMoneyPayment,
  reconcileYooMoneyPayment,
  type YooMoneyPayment,
} from '#entities/payment';
import { getCurrentUser, useUserStore } from '#entities/user';

import { PaymentResultPage } from '../PaymentResultPage';

vi.mock('#entities/payment', async () => {
  const actual = await vi.importActual<typeof import('#entities/payment')>('#entities/payment');
  return {
    ...actual,
    getYooMoneyPayment: vi.fn(),
    reconcileYooMoneyPayment: vi.fn(),
  };
});

vi.mock('#entities/user', async () => {
  const actual = await vi.importActual<typeof import('#entities/user')>('#entities/user');
  return { ...actual, getCurrentUser: vi.fn() };
});

const user = {
  id: 'one', name: 'Миша', balance: '100.00', negative_balance_limit: '200.00',
  role: 'user' as const, account_status: 'active' as const, block_source: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

const payment: YooMoneyPayment = {
  id: 'payment-one',
  status: 'pending',
  requested_amount: '100.00',
  received_amount: null,
  created_at: new Date().toISOString(),
  paid_at: null,
  checkout: null,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/payments/payment-one']}>
        <Routes>
          <Route path="/payments/:paymentId" element={<PaymentResultPage />} />
          <Route path="/" element={<p>Главная</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PaymentResultPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getYooMoneyPayment).mockResolvedValue(payment);
    vi.mocked(reconcileYooMoneyPayment).mockResolvedValue(payment);
    useUserStore.setState({ user: { ...user, balance: '0.00' }, status: 'authenticated' });
    vi.mocked(getCurrentUser).mockResolvedValue(user);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a pending payment without changing the user balance', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Ожидаем подтверждение' })).toBeInTheDocument();
    expect(reconcileYooMoneyPayment).toHaveBeenCalledWith('payment-one');
    expect(getYooMoneyPayment).not.toHaveBeenCalled();
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it('refreshes the current user after a succeeded payment', async () => {
    vi.mocked(reconcileYooMoneyPayment).mockResolvedValue({
      ...payment, status: 'succeeded', received_amount: '100.01', paid_at: new Date().toISOString(),
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Баланс пополнен' })).toBeInTheDocument();
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledOnce());
    expect(useUserStore.getState().user?.balance).toBe('100.00');
    expect(screen.getByText(/100,01/)).toBeInTheDocument();
  });

  it('reconciles every ten seconds for one minute, then polls only the local status', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-18T00:00:00Z'));
    const view = renderPage();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reconcileYooMoneyPayment).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000);
    });
    expect(reconcileYooMoneyPayment).toHaveBeenCalledTimes(6);
    expect(getYooMoneyPayment).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(reconcileYooMoneyPayment).toHaveBeenCalledTimes(6);
    expect(getYooMoneyPayment).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(reconcileYooMoneyPayment).toHaveBeenCalledTimes(6);
    expect(getYooMoneyPayment).toHaveBeenCalledTimes(3);
    view.unmount();
  });
});
