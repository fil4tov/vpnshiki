import { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';

import styles from './MonthlyHistory.module.scss';

export interface MonthlyHistoryRow {
  id: string;
  dateTime: string;
  dateLabel: string;
  secondaryDescription?: string;
  description?: string;
  amount: string;
  breakdownAmounts?: [string, string];
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
  secondaryDescription?: string;
  description?: string;
  amount: string;
  breakdownAmounts?: [string, string];
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
                    className={`${styles.row} ${styles.columnHeader} ${columnLabels.totalAmount ? styles.rowWithTotal : ''} ${columnLabels.breakdownAmounts ? styles.rowWithBreakdown : ''} ${columnLabels.secondaryDescription ? styles.rowWithSecondaryDescription : ''} ${columnLabels.description ? '' : styles.rowWithoutDescription}`}
                  >
                    <span>{columnLabels.date}</span>
                    {columnLabels.secondaryDescription && (
                      <span>{columnLabels.secondaryDescription}</span>
                    )}
                    {columnLabels.description && <span>{columnLabels.description}</span>}
                    <span>{columnLabels.amount}</span>
                    {columnLabels.breakdownAmounts?.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                    {columnLabels.totalAmount && <span>{columnLabels.totalAmount}</span>}
                  </div>
                )}
                {group.rows.map((row) => (
                  <div
                    key={row.id}
                    className={`${styles.row} ${row.totalAmount ? styles.rowWithTotal : ''} ${row.breakdownAmounts ? styles.rowWithBreakdown : ''} ${row.secondaryDescription ? styles.rowWithSecondaryDescription : ''} ${row.description ? '' : styles.rowWithoutDescription}`}
                  >
                    <time dateTime={row.dateTime} data-label={columnLabels?.date}>
                      {row.dateLabel}
                    </time>
                    {row.secondaryDescription && (
                      <span
                        title={row.secondaryDescription}
                        data-label={columnLabels?.secondaryDescription}
                      >
                        {row.secondaryDescription}
                      </span>
                    )}
                    {row.description && (
                      <span title={row.description} data-label={columnLabels?.description}>
                        {row.description}
                      </span>
                    )}
                    <strong data-label={columnLabels?.amount}>{row.amount}</strong>
                    {row.breakdownAmounts?.map((amount, index) => (
                      <strong
                        key={columnLabels?.breakdownAmounts?.[index] ?? index}
                        data-label={columnLabels?.breakdownAmounts?.[index]}
                      >
                        {amount}
                      </strong>
                    ))}
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
