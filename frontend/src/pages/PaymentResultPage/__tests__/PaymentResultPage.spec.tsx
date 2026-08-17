import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import { getYooMoneyPayment, type YooMoneyPayment } from '#entities/payment';
import { getCurrentUser, useUserStore } from '#entities/user';

import { PaymentResultPage } from '../PaymentResultPage';

vi.mock('#entities/payment', async () => {
  const actual = await vi.importActual<typeof import('#entities/payment')>('#entities/payment');
  return { ...actual, getYooMoneyPayment: vi.fn() };
});

vi.mock('#entities/user', async () => {
  const actual = await vi.importActual<typeof import('#entities/user')>('#entities/user');
  return { ...actual, getCurrentUser: vi.fn() };
});

const user = {
  id: 'one', name: 'Миша', balance: '100.00', negative_balance_limit: '200.00',
  role: 'user' as const, account_status: 'active' as const,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

const payment: YooMoneyPayment = {
  id: 'payment-one',
  status: 'pending',
  payment_type: 'AC',
  credit_amount: '100.00',
  payable_amount: '103.10',
  received_amount: null,
  review_reason: null,
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
    useUserStore.setState({ user: { ...user, balance: '0.00' }, status: 'authenticated' });
    vi.mocked(getCurrentUser).mockResolvedValue(user);
  });

  it('shows a pending payment without changing the user balance', async () => {
    vi.mocked(getYooMoneyPayment).mockResolvedValue(payment);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Ожидаем подтверждение' })).toBeInTheDocument();
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it('refreshes the current user after a succeeded payment', async () => {
    vi.mocked(getYooMoneyPayment).mockResolvedValue({
      ...payment, status: 'succeeded', received_amount: '100.01', paid_at: new Date().toISOString(),
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Баланс пополнен' })).toBeInTheDocument();
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledOnce());
    expect(useUserStore.getState().user?.balance).toBe('100.00');
  });

  it('shows the payment id when manual review is required', async () => {
    vi.mocked(getYooMoneyPayment).mockResolvedValue({
      ...payment, status: 'review_required', review_reason: 'withdraw_amount_mismatch',
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Платёж требует проверки' })).toBeInTheDocument();
    expect(screen.getByText('payment-one')).toBeInTheDocument();
  });
});
