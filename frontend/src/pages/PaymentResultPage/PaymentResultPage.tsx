import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FiAlertTriangle, FiCheckCircle, FiClock } from 'react-icons/fi';
import { useNavigate, useParams } from 'react-router-dom';

import {
  getYooMoneyPayment,
  reconcileYooMoneyPayment,
  yooMoneyPaymentKey,
} from '#entities/payment';
import {
  adminUsersKey,
  getCurrentUser,
  myTopUpsKey,
  useUserStore,
} from '#entities/user';
import { formatMoney } from '#shared/lib/money';
import { Button, LoadingState, Surface } from '#shared/ui';

import styles from './PaymentResultPage.module.scss';

const PAYMENT_POLL_INTERVAL_MS = 10_000;
const TARGETED_RECONCILIATION_WINDOW_MS = 60_000;

export function PaymentResultPage() {
  const { paymentId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setUser = useUserStore((state) => state.setUser);
  const refreshedPaymentId = useRef<string | null>(null);
  const reconciliationStartedAt = useRef<number | null>(null);
  const paymentQuery = useQuery({
    queryKey: yooMoneyPaymentKey(paymentId),
    queryFn: () => {
      const now = Date.now();
      reconciliationStartedAt.current ??= now;
      return now - reconciliationStartedAt.current < TARGETED_RECONCILIATION_WINDOW_MS
        ? reconcileYooMoneyPayment(paymentId)
        : getYooMoneyPayment(paymentId);
    },
    enabled: Boolean(paymentId),
    refetchInterval: (query) => (
      query.state.data?.status === 'pending' ? PAYMENT_POLL_INTERVAL_MS : false
    ),
  });

  useEffect(() => {
    const payment = paymentQuery.data;
    if (payment?.status !== 'succeeded' || refreshedPaymentId.current === payment.id) return;
    refreshedPaymentId.current = payment.id;
    void getCurrentUser().then((user) => {
      setUser(user);
      void queryClient.invalidateQueries({ queryKey: myTopUpsKey, exact: true });
      void queryClient.invalidateQueries({ queryKey: adminUsersKey, exact: true });
    }).catch(() => {
      refreshedPaymentId.current = null;
    });
  }, [paymentQuery.data, queryClient, setUser]);

  if (paymentQuery.isPending) return <LoadingState label="Проверяем платёж" />;

  if (paymentQuery.isError || !paymentQuery.data) {
    return (
      <Surface className={styles.card} elevated>
        <FiAlertTriangle className={styles.dangerIcon} aria-hidden="true" />
        <p className={styles.eyebrow}>YooMoney</p>
        <h1>Не удалось проверить платёж</h1>
        <p>Обновите страницу или вернитесь к балансу и проверьте историю пополнений.</p>
        <Button type="button" onClick={() => navigate('/')}>Вернуться на главную</Button>
      </Surface>
    );
  }

  const payment = paymentQuery.data;
  const content = {
    pending: {
      icon: <FiClock className={styles.pendingIcon} aria-hidden="true" />,
      title: 'Ожидаем подтверждение',
      text: 'YooMoney ещё не подтвердил перевод. Страница обновится автоматически.',
    },
    succeeded: {
      icon: <FiCheckCircle className={styles.successIcon} aria-hidden="true" />,
      title: 'Баланс пополнен',
      text: payment.received_amount
        ? `${formatMoney(payment.received_amount)} успешно зачислены на ваш баланс.`
        : 'Платёж успешно подтверждён.',
    },
  }[payment.status];

  return (
    <Surface className={styles.card} elevated>
      {content.icon}
      <p className={styles.eyebrow}>YooMoney</p>
      <h1>{content.title}</h1>
      <p>{content.text}</p>
      <Button type="button" onClick={() => navigate('/')}>Вернуться на главную</Button>
    </Surface>
  );
}
