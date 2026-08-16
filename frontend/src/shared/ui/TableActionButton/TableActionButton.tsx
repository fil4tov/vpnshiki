import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './TableActionButton.module.scss';

interface TableActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function TableActionButton({ children, className = '', ...props }: TableActionButtonProps) {
  return (
    <button className={`${styles.button} ${className}`} type="button" {...props}>
      {children}
    </button>
  );
}
