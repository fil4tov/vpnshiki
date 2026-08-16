import styles from './HistorySummary.module.scss';

export interface HistorySummaryItem {
  label: string;
  value: string;
  accent?: boolean;
}

export function HistorySummary({ items }: { items: HistorySummaryItem[] }) {
  return (
    <div className={styles.summary}>
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong className={item.accent ? styles.accent : ''}>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
