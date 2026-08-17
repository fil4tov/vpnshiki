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
  payment_type: 'PC',
  credit_amount: '100.00',
  payable_amount: '101.00',
  received_amount: null,
  review_reason: null,
  created_at: new Date().toISOString(),
  paid_at: null,
  checkout: {
    action: 'https://yoomoney.ru/quickpay/confirm',
    method: 'POST',
    fields: { label: 'pay_123', sum: '101.00' },
  },
};

describe('TopUpModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createYooMoneyPayment).mockResolvedValue(payment);
  });

  it('creates a payment, shows the authoritative summary and submits checkout', async () => {
    render(<TopUpModal open onClose={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(await screen.findByText('Введите сумму пополнения')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Сумма пополнения, ₽'), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByLabelText('Кошелёк YooMoney'));
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    await waitFor(() => expect(createYooMoneyPayment).toHaveBeenCalledWith({
      amount: '100',
      payment_type: 'PC',
    }));
    expect(screen.getByText('На баланс')).toBeInTheDocument();
    expect(screen.getByText(/100,00/)).toBeInTheDocument();
    expect(screen.getByText(/101,00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Перейти к оплате' }));
    expect(submitCheckoutForm).toHaveBeenCalledWith(payment.checkout);
  });

  it('validates the configured amount range', async () => {
    render(<TopUpModal open onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Сумма пополнения, ₽'), {
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
    fireEvent.change(screen.getByLabelText('Сумма пополнения, ₽'), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(await screen.findByText('Некорректная сумма пополнения')).toBeInTheDocument();
  });
});
