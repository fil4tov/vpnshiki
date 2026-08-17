import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  createYooMoneyPayment,
  type YooMoneyPayment,
  type YooMoneyPaymentType,
} from '#entities/payment';
import { ApiError } from '#shared/api';
import { formatMoney } from '#shared/lib/money';
import { Button, Modal, TextField } from '#shared/ui';

import styles from './TopUpModal.module.scss';
import { submitCheckoutForm } from './utils';

interface TopUpForm {
  amount: string;
  payment_type: YooMoneyPaymentType;
}

interface TopUpModalProps {
  open: boolean;
  onClose: () => void;
}

const paymentTypeLabels: Record<YooMoneyPaymentType, string> = {
  AC: 'Банковская карта',
  PC: 'Кошелёк YooMoney',
};

export function TopUpModal({ open, onClose }: TopUpModalProps) {
  const [payment, setPayment] = useState<YooMoneyPayment | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TopUpForm>({ defaultValues: { payment_type: 'AC' } });

  const resetAndClose = () => {
    setPayment(null);
    reset();
    window.requestAnimationFrame(onClose);
  };

  const submit = handleSubmit(async (values) => {
    try {
      setPayment(await createYooMoneyPayment(values));
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors?.amount) {
        setError('amount', { message: error.fieldErrors.amount });
      } else {
        setError('root', {
          message: error instanceof ApiError ? error.message : 'Не удалось подготовить платёж',
        });
      }
    }
  });

  const pay = () => {
    if (payment?.checkout) submitCheckoutForm(payment.checkout);
  };

  return (
    <Modal
      open={open}
      title="Пополнить баланс"
      description={payment
        ? 'Проверьте сумму перед переходом на сторону YooMoney.'
        : 'Выберите сумму зачисления и способ оплаты.'}
      onClose={resetAndClose}
    >
      {payment ? (
        <div className={styles.summary}>
          <dl className={styles.amounts}>
            <div>
              <dt>На баланс</dt>
              <dd>{formatMoney(payment.credit_amount)}</dd>
            </div>
            <div>
              <dt>Способ оплаты</dt>
              <dd>{paymentTypeLabels[payment.payment_type]}</dd>
            </div>
            <div className={styles.total}>
              <dt>К оплате</dt>
              <dd>{formatMoney(payment.payable_amount)}</dd>
            </div>
          </dl>
          <p className={styles.notice}>
            Комиссия учтена в итоговой сумме. Баланс изменится только после подтверждения платежа.
          </p>
          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={() => setPayment(null)}>Назад</Button>
            <Button type="button" onClick={pay}>Перейти к оплате</Button>
          </div>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <TextField
            label="Сумма пополнения, ₽"
            type="number"
            min="10"
            max="5000"
            step="0.01"
            inputMode="decimal"
            autoComplete="off"
            placeholder="100,00"
            inputClassName={styles.amountInput}
            error={errors.amount?.message}
            {...register('amount', {
              required: 'Введите сумму пополнения',
              min: { value: 10, message: 'Минимальная сумма — 10 ₽' },
              max: { value: 5000, message: 'Максимальная сумма — 5 000 ₽' },
            })}
          />
          <fieldset className={styles.paymentTypes}>
            <legend>Способ оплаты</legend>
            {(['AC', 'PC'] as const).map((type) => (
              <label key={type}>
                <input type="radio" value={type} {...register('payment_type')} />
                <span>{paymentTypeLabels[type]}</span>
              </label>
            ))}
          </fieldset>
          {errors.root?.message && <p className={styles.error} role="alert">{errors.root.message}</p>}
          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={resetAndClose}>Отмена</Button>
            <Button type="submit" loading={isSubmitting}>Продолжить</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
