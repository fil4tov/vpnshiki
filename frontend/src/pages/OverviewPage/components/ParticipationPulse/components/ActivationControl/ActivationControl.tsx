import { useId } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { activateMyAccount, myDailyChargeKey, useUserStore } from '#entities/user';
import { ApiError } from '#shared/api';
import { Switch } from '#shared/ui';

import styles from './ActivationControl.module.scss';

interface ActivationControlProps {
  balance: string;
  negativeBalanceLimit: string;
}

export function ActivationControl({ balance, negativeBalanceLimit }: ActivationControlProps) {
  const descriptionId = useId();
  const queryClient = useQueryClient();
  const setUser = useUserStore((state) => state.setUser);
  const balanceValue = Number(balance);
  const limitValue = Number(negativeBalanceLimit);
  const canActivate = Number.isFinite(balanceValue)
    && Number.isFinite(limitValue)
    && balanceValue >= -limitValue;
  const activation = useMutation({
    mutationFn: activateMyAccount,
    onSuccess: (user) => {
      setUser(user);
      void queryClient.invalidateQueries({ queryKey: myDailyChargeKey });
    },
  });
  const error = activation.error instanceof ApiError
    ? activation.error.message
    : activation.error
      ? 'Не удалось активировать аккаунт'
      : null;

  return (
    <div className={styles.control}>
      <div className={styles.copy}>
        <strong>{activation.isPending ? 'Активируем аккаунт' : 'Активировать аккаунт'}</strong>
        {!canActivate && <small id={descriptionId}>Пополните баланс для активации</small>}
        {error && canActivate && <small id={descriptionId} role="alert">{error}</small>}
      </div>
      <Switch
        checked={activation.isPending}
        label="Активировать аккаунт"
        disabled={!canActivate || activation.isPending}
        aria-busy={activation.isPending}
        aria-describedby={!canActivate || error ? descriptionId : undefined}
        onClick={() => activation.mutate()}
      />
    </div>
  );
}
