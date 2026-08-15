import type { ButtonHTMLAttributes } from 'react';

import styles from './Switch.module.scss';

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'role'> {
  checked: boolean;
  label: string;
}

export function Switch({ checked, label, className = '', ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${styles.switch} ${checked ? styles.checked : ''} ${className}`}
      {...props}
    >
      <span className={styles.thumb} />
    </button>
  );
}

