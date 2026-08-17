import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { topUpMyBalance, useUserStore } from '#entities/user';
import { ApiError } from '#shared/api';

import { TopUpModal } from '../TopUpModal';

const user = {
  id: 'one', name: 'Миша', balance: '10.00', negative_balance_limit: '200.00',
  role: 'user' as const, account_status: 'active' as const,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

vi.mock('#entities/user', async () => {
  const actual = await vi.importActual<typeof import('#entities/user')>('#entities/user');
  return { ...actual, topUpMyBalance: vi.fn() };
});

function renderModal(onClose: () => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TopUpModal open onClose={onClose} />
    </QueryClientProvider>,
  );
}

describe('TopUpModal', () => {
  beforeEach(() => {
    useUserStore.setState({ user, status: 'authenticated' });
    vi.mocked(topUpMyBalance).mockReset();
  });

  it('validates and submits a positive amount', async () => {
    const onClose = vi.fn();
    const updatedUser = { ...user, balance: '35.50' };
    vi.mocked(topUpMyBalance).mockResolvedValue(updatedUser);
    renderModal(onClose);

    fireEvent.click(screen.getByRole('button', { name: 'Пополнить' }));
    expect(await screen.findByText('Введите сумму пополнения')).toBeInTheDocument();
    expect(topUpMyBalance).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Сумма пополнения, ₽'), {
      target: { value: '25.50' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Пополнить' }));

    await waitFor(() => expect(topUpMyBalance).toHaveBeenCalledWith({ amount: '25.50' }));
    expect(useUserStore.getState().user).toEqual(updatedUser);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows an amount error returned by the API', async () => {
    vi.mocked(topUpMyBalance).mockRejectedValue(new ApiError({
      code: 'balance_overflow',
      message: 'Сумма пополнения слишком велика',
      status: 400,
      fieldErrors: { amount: 'Итоговый баланс превышает допустимое значение' },
    }));
    renderModal(() => undefined);

    fireEvent.change(screen.getByLabelText('Сумма пополнения, ₽'), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Пополнить' }));

    expect(await screen.findByText('Итоговый баланс превышает допустимое значение')).toBeInTheDocument();
  });
});
