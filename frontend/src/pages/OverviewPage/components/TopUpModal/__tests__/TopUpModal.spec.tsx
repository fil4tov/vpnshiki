import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { createYooMoneyPayment, type YooMoneyPayment } from '#entities/payment';
import { ApiError } from '#shared/api';

import { TopUpModal } from '../TopUpModal';
import { submitCheckoutForm } from '../utils';

vi.mock('#entities/payment', async () => {
  const actual = await vi.importActual<typeof import('#entities/payment')>('#entities/payment');
  return { ...actual, createYooMoneyPayment: vi.fn() };
});

vi.mock('../utils', () => ({ submitCheckoutForm: vi.fn() }));

const payment: YooMoneyPayment = {
  id: 'payment-one',
  status: 'pending',
  requested_amount: '100.00',
  received_amount: null,
  created_at: new Date().toISOString(),
  paid_at: null,
  checkout: {
    action: 'https://yoomoney.ru/quickpay/confirm',
    method: 'POST',
    fields: { label: 'pay_123', sum: '100.00', paymentType: 'AC' },
  },
};

describe('TopUpModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createYooMoneyPayment).mockResolvedValue(payment);
  });

  it('creates a payment, shows the authoritative summary and submits checkout', async () => {
    render(<TopUpModal open onClose={() => undefined} />);

    expect(screen.queryByText('Укажите сумму, которую хотите заплатить.')).not.toBeInTheDocument();
    expect(screen.getByText(/ЮMoney взимает комиссию от 1 до 3%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(await screen.findByText('Введите сумму платежа')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Сумма платежа, ₽'), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    await waitFor(() => expect(createYooMoneyPayment).toHaveBeenCalledWith({
      amount: '100',
    }));
    expect(screen.getByText('К оплате')).toBeInTheDocument();
    expect(screen.getByText(/100,00/)).toBeInTheDocument();
    expect(screen.getByText(/ЮMoney взимает комиссию от 1 до 3%/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Перейти к оплате' }));
    expect(submitCheckoutForm).toHaveBeenCalledWith(payment.checkout);
  });

  it('validates the configured amount range', async () => {
    render(<TopUpModal open onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Сумма платежа, ₽'), {
      target: { value: '9.99' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(await screen.findByText('Минимальная сумма — 10 ₽')).toBeInTheDocument();
    expect(createYooMoneyPayment).not.toHaveBeenCalled();
  });

  it('shows an amount error returned by the API', async () => {
    vi.mocked(createYooMoneyPayment).mockRejectedValue(new ApiError({
      code: 'validation_error',
      message: 'Проверьте заполненные поля',
      status: 422,
      fieldErrors: { amount: 'Некорректная сумма пополнения' },
    }));
    render(<TopUpModal open onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Сумма платежа, ₽'), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(await screen.findByText('Некорректная сумма пополнения')).toBeInTheDocument();
  });
});
