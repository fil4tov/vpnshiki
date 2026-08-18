import { useQuery } from '@tanstack/react-query';
import { FiCreditCard } from 'react-icons/fi';

import {
  adminYooMoneyPaymentsKey,
  getAdminYooMoneyPayments,
} from '#entities/payment';
import { Button, LoadingState, Surface } from '#shared/ui';

import { OperationsView } from './components';
import styles from './TopUpsPage.module.scss';

export function TopUpsPage() {
  const paymentsQuery = useQuery({
    queryKey: adminYooMoneyPaymentsKey,
    queryFn: getAdminYooMoneyPayments,
  });
  const payments = paymentsQuery.data ?? [];

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Платёжный контур</p>
          <h1>Пополнения</h1>
        </div>
      </header>

      {paymentsQuery.isLoading ? <Surface><LoadingState label="Загружаем пополнения" /></Surface> : paymentsQuery.isError ? (
        <Surface className={styles.message}>
          <span className={styles.messageIcon}><FiCreditCard aria-hidden="true" /></span>
          <div><strong>Не удалось загрузить пополнения</strong><p>Проверьте соединение с backend и повторите запрос.</p></div>
          <Button variant="secondary" onClick={() => void paymentsQuery.refetch()}>Повторить</Button>
        </Surface>
      ) : payments.length === 0 ? (
        <Surface className={styles.message}>
          <span className={styles.messageIcon}><FiCreditCard aria-hidden="true" /></span>
          <div>
            <strong>Пополнений пока нет</strong>
            <p>Новые платежи появятся здесь после создания checkout.</p>
          </div>
        </Surface>
      ) : (
        <OperationsView payments={payments} />
      )}
    </div>
  );
}
