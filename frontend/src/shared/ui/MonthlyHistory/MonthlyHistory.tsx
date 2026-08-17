import { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';

import styles from './MonthlyHistory.module.scss';

export interface MonthlyHistoryRow {
  id: string;
  dateTime: string;
  dateLabel: string;
  description: string;
  amount: string;
  totalAmount?: string;
}

export interface MonthlyHistoryGroup {
  key: string;
  label: string;
  countLabel: string;
  total: string;
  rows: MonthlyHistoryRow[];
}

interface MonthlyHistoryColumnLabels {
  date: string;
  description: string;
  amount: string;
  totalAmount?: string;
}

export function MonthlyHistory({
  groups,
  columnLabels,
}: {
  groups: MonthlyHistoryGroup[];
  columnLabels?: MonthlyHistoryColumnLabels;
}) {
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
                {columnLabels && (
                  <div
                    className={`${styles.row} ${styles.columnHeader} ${columnLabels.totalAmount ? styles.rowWithTotal : ''}`}
                  >
                    <span>{columnLabels.date}</span>
                    <span>{columnLabels.description}</span>
                    <span>{columnLabels.amount}</span>
                    {columnLabels.totalAmount && <span>{columnLabels.totalAmount}</span>}
                  </div>
                )}
                {group.rows.map((row) => (
                  <div
                    key={row.id}
                    className={`${styles.row} ${row.totalAmount ? styles.rowWithTotal : ''}`}
                  >
                    <time dateTime={row.dateTime}>{row.dateLabel}</time>
                    <span title={row.description}>{row.description}</span>
                    <strong data-label={columnLabels?.amount}>{row.amount}</strong>
                    {row.totalAmount && (
                      <strong data-label={columnLabels?.totalAmount}>{row.totalAmount}</strong>
                    )}
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
