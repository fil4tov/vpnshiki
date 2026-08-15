import type { HTMLAttributes, ReactNode } from 'react';

import styles from './Surface.module.scss';

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  elevated?: boolean;
}

export function Surface({ children, elevated = false, className = '', ...props }: SurfaceProps) {
  return (
    <div className={`${styles.surface} ${elevated ? styles.elevated : ''} ${className}`} {...props}>
      {children}
    </div>
  );
}

