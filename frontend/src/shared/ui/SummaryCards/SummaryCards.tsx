import type { HTMLAttributes, ReactNode } from 'react';

import { Surface } from '../Surface';
import styles from './SummaryCards.module.scss';

type SummaryCardTone = 'accent' | 'positive' | 'warning' | 'danger';

export function SummaryCards({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={`${styles.grid} ${className}`} {...props}>
      {children}
    </section>
  );
}

export function SummaryCard({
  label,
  value,
  icon,
  indicator = false,
  tone = 'accent',
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  indicator?: boolean;
  tone?: SummaryCardTone;
}) {
  return (
    <Surface className={styles.card}>
      <span className={`${styles.visual} ${styles[tone]}`} aria-hidden="true">
        {indicator ? <span className={styles.dot} /> : icon}
      </span>
      <div className={styles.content}>
        <span className={styles.label}>{label}</span>
        <strong className={styles.value}>{value}</strong>
      </div>
    </Surface>
  );
}
