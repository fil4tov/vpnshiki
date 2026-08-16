import { useForm } from 'react-hook-form';

import { topUpMyBalance, useUserStore } from '#entities/user';
import { ApiError } from '#shared/api';
import { Button, Modal, TextField } from '#shared/ui';

import styles from './TopUpModal.module.scss';

interface TopUpForm {
  amount: string;
}

interface TopUpModalProps {
  open: boolean;
  onClose: () => void;
}

export function TopUpModal({ open, onClose }: TopUpModalProps) {
  const setUser = useUserStore((state) => state.setUser);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TopUpForm>();

  const resetAndClose = () => {
    reset();
    window.requestAnimationFrame(onClose);
  };

  const closeAfterSuccess = () => {
    onClose();
    window.requestAnimationFrame(() => reset());
  };

  const submit = handleSubmit(async (values) => {
    try {
      setUser(await topUpMyBalance({ amount: values.amount }));
      closeAfterSuccess();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors?.amount) {
        setError('amount', { message: error.fieldErrors.amount });
      } else {
        setError('root', {
          message: error instanceof ApiError ? error.message : 'Не удалось пополнить баланс',
        });
      }
    }
  });

  return (
    <Modal
      open={open}
      title="Пополнить баланс"
      description="Укажите сумму, которую хотите добавить к балансу."
      onClose={resetAndClose}
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label="Сумма пополнения, ₽"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          inputClassName={styles.amountInput}
          error={errors.amount?.message}
          {...register('amount', {
            required: 'Введите сумму пополнения',
            min: { value: 0.01, message: 'Сумма должна быть больше нуля' },
          })}
        />
        {errors.root?.message && <p className={styles.error}>{errors.root.message}</p>}
        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={resetAndClose}>Отмена</Button>
          <Button type="submit" loading={isSubmitting}>Пополнить</Button>
        </div>
      </form>
    </Modal>
  );
}
