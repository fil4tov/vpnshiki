import type { ReactNode } from 'react';

import styles from './Badge.module.scss';

type Tone = 'neutral' | 'positive' | 'danger' | 'accent' | 'warning';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

