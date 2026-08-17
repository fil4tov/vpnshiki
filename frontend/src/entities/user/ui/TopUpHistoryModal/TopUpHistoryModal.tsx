import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { formatMoney } from '#shared/lib/money';
import { Button, HistorySummary, LoadingState, Modal, MonthlyHistory } from '#shared/ui';
import type { MonthlyHistoryGroup } from '#shared/ui';

import {
  getMyTopUps,
  getUserTopUps,
  myTopUpsKey,
  userTopUpsKey,
} from '../../api';
import type { User, UserTopUp } from '../../types';
import styles from '../FinancialHistoryModal.module.scss';

const MOSCOW_TIME_ZONE = 'Europe/Moscow';
const monthLabelFormatter = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
  timeZone: MOSCOW_TIME_ZONE,
});
const monthKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  month: '2-digit',
  year: 'numeric',
  timeZone: MOSCOW_TIME_ZONE,
});
const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: MOSCOW_TIME_ZONE,
});

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTopUpCount(value: number) {
  const lastTwoDigits = value % 100;
  const lastDigit = value % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${value} пополнений`;
  if (lastDigit === 1) return `${value} пополнение`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${value} пополнения`;
  return `${value} пополнений`;
}

function getMonthKey(createdAt: string) {
  const parts = monthKeyFormatter.formatToParts(new Date(createdAt));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function groupTopUps(topUps: UserTopUp[]): MonthlyHistoryGroup[] {
  const groups = new Map<string, UserTopUp[]>();
  topUps.forEach((topUp) => {
    const key = getMonthKey(topUp.created_at);
    groups.set(key, [...(groups.get(key) ?? []), topUp]);
  });
  return Array.from(groups, ([key, monthTopUps]) => {
    const totalInCents = monthTopUps.reduce(
      (total, topUp) => total + Math.round(Number(topUp.amount) * 100),
      0,
    );
    return {
      key,
      label: capitalize(
        monthLabelFormatter.format(new Date(monthTopUps[0].created_at)).replace(/\s+г\.$/, ''),
      ),
      countLabel: formatTopUpCount(monthTopUps.length),
      total: `+${formatMoney((totalInCents / 100).toFixed(2))}`,
      rows: monthTopUps.map((topUp) => ({
        id: topUp.id,
        dateTime: topUp.created_at,
        dateLabel: dateFormatter.format(new Date(topUp.created_at)),
        amount: `+${formatMoney(topUp.amount)}`,
      })),
    };
  });
}

export function TopUpHistoryModal({
  user,
  mode,
  total,
  onClose,
}: {
  user: Pick<User, 'id' | 'name'>;
  mode: 'self' | 'admin';
  total?: string;
  onClose: () => void;
}) {
  const historyQuery = useQuery({
    queryKey: mode === 'admin' ? userTopUpsKey(user.id) : myTopUpsKey,
    queryFn: mode === 'admin' ? () => getUserTopUps(user.id) : getMyTopUps,
  });
  const groups = useMemo(() => groupTopUps(historyQuery.data ?? []), [historyQuery.data]);
  const fetchedTotal = (historyQuery.data ?? []).reduce(
    (sum, topUp) => sum + Math.round(Number(topUp.amount) * 100),
    0,
  );
  const totalValue = total ?? (historyQuery.data ? (fetchedTotal / 100).toFixed(2) : null);

  return (
    <Modal
      open
      title="История пополнений"
      description={<span className={styles.subject}>{user.name}</span>}
      className={styles.modal}
      onClose={onClose}
    >
      <HistorySummary items={[
        { label: 'Пополнено за всё время', value: totalValue ? `+${formatMoney(totalValue)}` : '—', accent: true },
        { label: 'Период', value: historyQuery.data ? `${groups.length} мес.` : '—' },
      ]} />

      {historyQuery.isLoading ? (
        <LoadingState label="Загружаем историю пополнений" />
      ) : historyQuery.isError ? (
        <div className={styles.message}>
          <p>Не удалось загрузить историю пополнений.</p>
          <Button variant="secondary" onClick={() => void historyQuery.refetch()}>Повторить</Button>
        </div>
      ) : groups.length === 0 ? (
        <div className={styles.message}><p>У пользователя пока не было пополнений.</p></div>
      ) : (
        <MonthlyHistory groups={groups} columnLabels={{ date: 'Дата', amount: 'Сумма' }} />
      )}
    </Modal>
  );
}
