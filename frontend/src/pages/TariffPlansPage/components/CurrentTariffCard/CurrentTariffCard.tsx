import { FiArrowRight, FiCalendar, FiRefreshCw, FiUsers } from 'react-icons/fi';

import {
  calculateDailyCharge,
  formatCalendarDate,
  getDaysInMoscowMonth,
} from '#entities/tariffPlan';
import type { TariffPlan } from '#entities/tariffPlan';
import { formatMoney } from '#shared/lib/money';
import { Surface } from '#shared/ui';

import styles from './CurrentTariffCard.module.scss';

interface CurrentTariffCardProps {
  plan?: TariffPlan;
  activeUsers?: number;
  usersError?: boolean;
}

function DailyCharge({ amount, activeUsers, usersError }: {
  amount: string | null;
  activeUsers?: number;
  usersError: boolean;
}) {
  let note: string | null = null;
  if (usersError) note = 'Не удалось получить участников';
  else if (activeUsers === undefined) note = 'Считаем участников…';
  else if (activeUsers === 0) note = 'Нет активных пользователей';

  return (
    <div className={styles.charge}>
      <span className={styles.chargeLabel}><i aria-hidden="true" />В сутки</span>
      <div className={styles.chargeDial}>
        <div className={styles.orbit} aria-hidden="true"><span /><span /></div>
        <div className={styles.chargeContent}>
          <strong>{amount ? formatMoney(amount) : '—'}</strong>
        </div>
      </div>
      {note && <span className={styles.srOnly}>{note}</span>}
    </div>
  );
}

export function CurrentTariffCard({ plan, activeUsers, usersError = false }: CurrentTariffCardProps) {
  if (!plan) {
    return (
      <Surface className={styles.empty} role="region" aria-label="Текущий тарифный план">
        <span className={styles.emptyIcon}><FiCalendar aria-hidden="true" /></span>
        <div>
          <strong>Сейчас нет действующего тарифного плана</strong>
          <p>Текущие условия появятся здесь, когда начнётся первый или следующий план.</p>
        </div>
      </Surface>
    );
  }

  const daysInMonth = getDaysInMoscowMonth();
  const dailyCharge = activeUsers === undefined
    ? null
    : calculateDailyCharge(plan.monthly_amount, daysInMonth, activeUsers);

  return (
    <Surface className={styles.card} role="region" aria-label="Текущий тарифный план">
      <div className={styles.details}>
        <div className={styles.topline}>
          <div>
            <span className={styles.status}><i aria-hidden="true" />Действует сейчас</span>
            <h2>{plan.name}</h2>
          </div>
          <div className={styles.monthlyAmount}>
            <span>Сумма за месяц</span>
            <strong>{formatMoney(plan.monthly_amount)}</strong>
          </div>
        </div>

        <div className={styles.period}>
          <div>
            <span>Начало</span>
            <time dateTime={plan.start_date}>{formatCalendarDate(plan.start_date)}</time>
          </div>
          <span className={styles.periodLine} aria-hidden="true">
            <i /><FiArrowRight />
          </span>
          <div className={styles.periodEnd}>
            <span>Окончание</span>
            {plan.end_date
              ? <time dateTime={plan.end_date}>{formatCalendarDate(plan.end_date)}</time>
              : <strong>Бессрочно</strong>}
          </div>
        </div>

        <div className={styles.stats}>
          <div>
            <FiUsers aria-hidden="true" />
            <span>Активных пользователей</span>
            <strong>{activeUsers ?? '—'}</strong>
          </div>
          <div>
            <FiCalendar aria-hidden="true" />
            <span>Расчётных дней</span>
            <strong>{daysInMonth}</strong>
          </div>
          <div>
            <FiRefreshCw aria-hidden="true" />
            <span>Перерасчёт</span>
            <strong>Ежесуточно</strong>
          </div>
        </div>
      </div>

      <DailyCharge amount={dailyCharge} activeUsers={activeUsers} usersError={usersError} />
    </Surface>
  );
}
