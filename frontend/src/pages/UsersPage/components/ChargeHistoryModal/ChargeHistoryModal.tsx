import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  getUserCharges,
  userChargesKey,
} from '#entities/user';
import type { AdminUser, UserCharge } from '#entities/user';
import { formatMoney } from '#shared/lib/money';
import { Button, HistorySummary, LoadingState, Modal, MonthlyHistory } from '#shared/ui';
import type { MonthlyHistoryGroup } from '#shared/ui';

import styles from './ChargeHistoryModal.module.scss';

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

function formatChargeCount(value: number) {
  const lastTwoDigits = value % 100;
  const lastDigit = value % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${value} списаний`;
  if (lastDigit === 1) return `${value} списание`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${value} списания`;
  return `${value} списаний`;
}

function getMonthKey(createdAt: string) {
  const parts = monthKeyFormatter.formatToParts(new Date(createdAt));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function groupCharges(charges: UserCharge[]): MonthlyHistoryGroup[] {
  const groups = new Map<string, UserCharge[]>();
  charges.forEach((charge) => {
    const key = getMonthKey(charge.created_at);
    groups.set(key, [...(groups.get(key) ?? []), charge]);
  });
  return Array.from(groups, ([key, monthCharges]) => {
    const totalInCents = monthCharges.reduce(
      (total, charge) => total + Math.round(Number(charge.amount) * 100),
      0,
    );
    return {
      key,
      label: capitalize(
        monthLabelFormatter.format(new Date(monthCharges[0].created_at)).replace(/\s+г\.$/, ''),
      ),
      countLabel: formatChargeCount(monthCharges.length),
      total: formatMoney((totalInCents / 100).toFixed(2)),
      rows: monthCharges.map((charge) => ({
        id: charge.id,
        dateTime: charge.created_at,
        dateLabel: dateFormatter.format(new Date(charge.created_at)),
        description: charge.tariff_plan_name,
        amount: `−${formatMoney(charge.amount)}`,
      })),
    };
  });
}

export function ChargeHistoryModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const historyQuery = useQuery({
    queryKey: userChargesKey(user.id),
    queryFn: () => getUserCharges(user.id),
  });
  const groups = useMemo(() => groupCharges(historyQuery.data ?? []), [historyQuery.data]);

  return (
    <Modal
      open
      title="История списаний"
      description={<span className={styles.subject}>{user.name}</span>}
      className={styles.modal}
      onClose={onClose}
    >
      <HistorySummary items={[
        { label: 'Списано за всё время', value: formatMoney(user.total_charged), accent: true },
        { label: 'Период', value: `${groups.length} мес.` },
      ]} />

      {historyQuery.isLoading ? (
        <LoadingState label="Загружаем историю списаний" />
      ) : historyQuery.isError ? (
        <div className={styles.message}>
          <p>Не удалось загрузить историю списаний.</p>
          <Button variant="secondary" onClick={() => void historyQuery.refetch()}>Повторить</Button>
        </div>
      ) : groups.length === 0 ? (
        <div className={styles.message}>
          <p>У пользователя пока не было списаний.</p>
        </div>
      ) : (
        <MonthlyHistory groups={groups} />
      )}
    </Modal>
  );
}
