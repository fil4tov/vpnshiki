import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  getTariffPlanBillingHistory,
  tariffPlanBillingHistoryKey,
} from '#entities/tariffPlan';
import type { TariffPlan, TariffPlanBillingRun } from '#entities/tariffPlan';
import { formatMoney } from '#shared/lib/money';
import { Button, HistorySummary, LoadingState, Modal, MonthlyHistory } from '#shared/ui';
import type { MonthlyHistoryGroup } from '#shared/ui';

import styles from './TariffPlanBillingHistoryModal.module.scss';

const monthLabelFormatter = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Moscow',
});
const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Moscow',
});

function billingDate(value: string) {
  return new Date(`${value}T00:00:00+03:00`);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function pluralize(value: number, one: string, few: string, many: string) {
  const lastTwoDigits = value % 100;
  const lastDigit = value % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${value} ${many}`;
  if (lastDigit === 1) return `${value} ${one}`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${value} ${few}`;
  return `${value} ${many}`;
}

function groupRuns(runs: TariffPlanBillingRun[]): MonthlyHistoryGroup[] {
  const groups = new Map<string, TariffPlanBillingRun[]>();
  runs.forEach((run) => {
    const key = run.billing_date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), run]);
  });
  return Array.from(groups, ([key, monthRuns]) => {
    const totalInCents = monthRuns.reduce(
      (total, run) => total + Math.round(Number(run.daily_charge) * 100),
      0,
    );
    return {
      key,
      label: capitalize(
        monthLabelFormatter.format(billingDate(monthRuns[0].billing_date)).replace(/\s+г\.$/, ''),
      ),
      countLabel: pluralize(monthRuns.length, 'расчёт', 'расчёта', 'расчётов'),
      total: formatMoney((totalInCents / 100).toFixed(2)),
      rows: monthRuns.map((run) => ({
        id: run.id,
        dateTime: run.billing_date,
        dateLabel: dateFormatter.format(billingDate(run.billing_date)),
        description: pluralize(
          run.active_users_count,
          'пользователь',
          'пользователя',
          'пользователей',
        ),
        amount: `−${formatMoney(run.daily_charge)}`,
      })),
    };
  });
}

export function TariffPlanBillingHistoryModal({
  plan,
  onClose,
}: {
  plan: TariffPlan;
  onClose: () => void;
}) {
  const historyQuery = useQuery({
    queryKey: tariffPlanBillingHistoryKey(plan.id),
    queryFn: () => getTariffPlanBillingHistory(plan.id),
  });
  const groups = useMemo(() => groupRuns(historyQuery.data ?? []), [historyQuery.data]);
  const totalInCents = (historyQuery.data ?? []).reduce(
    (total, run) => total + Math.round(Number(run.daily_charge) * 100),
    0,
  );

  return (
    <Modal
      open
      title="История списаний"
      description={<span className={styles.subject}>{plan.name}</span>}
      className={styles.modal}
      onClose={onClose}
    >
      <HistorySummary items={[
        {
          label: 'Списано за всё время',
          value: historyQuery.data ? formatMoney((totalInCents / 100).toFixed(2)) : '—',
          accent: true,
        },
        {
          label: 'Расчётных дней',
          value: historyQuery.data ? String(historyQuery.data.length) : '—',
        },
      ]} />

      {historyQuery.isLoading ? (
        <LoadingState label="Загружаем историю тарификации" />
      ) : historyQuery.isError ? (
        <div className={styles.message}>
          <p>Не удалось загрузить историю тарификации.</p>
          <Button variant="secondary" onClick={() => void historyQuery.refetch()}>Повторить</Button>
        </div>
      ) : groups.length === 0 ? (
        <div className={styles.message}>
          <p>По тарифному плану пока не было списаний.</p>
        </div>
      ) : (
        <MonthlyHistory groups={groups} />
      )}
    </Modal>
  );
}
