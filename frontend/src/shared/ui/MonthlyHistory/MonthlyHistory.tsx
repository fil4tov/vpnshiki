import { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';

import styles from './MonthlyHistory.module.scss';

export interface MonthlyHistoryRow {
  id: string;
  dateTime: string;
  dateLabel: string;
  description: string;
  amount: string;
}

export interface MonthlyHistoryGroup {
  key: string;
  label: string;
  countLabel: string;
  total: string;
  rows: MonthlyHistoryRow[];
}

export function MonthlyHistory({ groups }: { groups: MonthlyHistoryGroup[] }) {
  const [openGroup, setOpenGroup] = useState<string | null>();
  const expandedGroup = openGroup === undefined ? groups[0]?.key : openGroup;

  return (
    <div className={styles.periods}>
      {groups.map((group) => {
        const expanded = expandedGroup === group.key;
        const panelId = `monthly-history-${group.key}`;
        return (
          <section key={group.key} className={`${styles.period} ${expanded ? styles.expanded : ''}`}>
            <button
              className={styles.periodButton}
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setOpenGroup(expanded ? null : group.key)}
            >
              <span className={styles.periodTitle}>
                <strong>{group.label}</strong>
                <small>{group.countLabel}</small>
              </span>
              <span className={styles.periodTotal}>
                <strong>{group.total}</strong>
                <small>за период</small>
              </span>
              <FiChevronDown aria-hidden="true" />
            </button>
            {expanded && (
              <div id={panelId} className={styles.rows}>
                {group.rows.map((row) => (
                  <div key={row.id} className={styles.row}>
                    <time dateTime={row.dateTime}>{row.dateLabel}</time>
                    <span title={row.description}>{row.description}</span>
                    <strong>{row.amount}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
