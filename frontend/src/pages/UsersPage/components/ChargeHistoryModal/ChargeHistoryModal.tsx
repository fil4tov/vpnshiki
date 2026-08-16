import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiChevronDown } from 'react-icons/fi';

import {
  getUserCharges,
  userChargesKey,
} from '#entities/user';
import type { AdminUser, UserCharge } from '#entities/user';
import { formatMoney } from '#shared/lib/money';
import { Button, LoadingState, Modal } from '#shared/ui';

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

interface ChargeGroup {
  key: string;
  label: string;
  total: string;
  charges: UserCharge[];
}

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

function groupCharges(charges: UserCharge[]): ChargeGroup[] {
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
      total: (totalInCents / 100).toFixed(2),
      charges: monthCharges,
    };
  });
}

export function ChargeHistoryModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [openMonth, setOpenMonth] = useState<string | null>();
  const historyQuery = useQuery({
    queryKey: userChargesKey(user.id),
    queryFn: () => getUserCharges(user.id),
  });
  const groups = useMemo(() => groupCharges(historyQuery.data ?? []), [historyQuery.data]);
  const expandedMonth = openMonth === undefined ? groups[0]?.key : openMonth;

  return (
    <Modal
      open
      title="История списаний"
      eyebrow={user.name}
      description="Все ежедневные списания по тарифным планам"
      className={styles.modal}
      onClose={onClose}
    >
      <div className={styles.summary}>
        <div>
          <span>Списано за всё время</span>
          <strong>{formatMoney(user.total_charged)}</strong>
        </div>
        <div>
          <span>Период</span>
          <strong>{groups.length} мес.</strong>
        </div>
      </div>

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
        <div className={styles.periods}>
          {groups.map((group) => {
            const expanded = expandedMonth === group.key;
            const panelId = `charge-period-${user.id}-${group.key}`;
            return (
              <section key={group.key} className={`${styles.period} ${expanded ? styles.expanded : ''}`}>
                <button
                  className={styles.periodButton}
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpenMonth(expanded ? null : group.key)}
                >
                  <span className={styles.periodTitle}>
                    <strong>{group.label}</strong>
                    <small>{formatChargeCount(group.charges.length)}</small>
                  </span>
                  <span className={styles.periodTotal}>
                    <strong>{formatMoney(group.total)}</strong>
                    <small>за период</small>
                  </span>
                  <FiChevronDown aria-hidden="true" />
                </button>
                {expanded && (
                  <div id={panelId} className={styles.rows}>
                    {group.charges.map((charge) => (
                      <div key={charge.id} className={styles.row}>
                        <time dateTime={charge.created_at}>{dateFormatter.format(new Date(charge.created_at))}</time>
                        <span title={charge.tariff_plan_name}>{charge.tariff_plan_name}</span>
                        <strong>−{formatMoney(charge.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
