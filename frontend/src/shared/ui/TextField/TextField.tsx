import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';

import styles from './TextField.module.scss';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, id, className = '', ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  return (
    <label className={`${styles.field} ${className}`} htmlFor={inputId}>
      <span className={styles.label}>{label}</span>
      <input
        ref={ref}
        id={inputId}
        className={`${styles.input} ${error ? styles.invalid : ''}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? messageId : undefined}
        {...props}
      />
      {(error || hint) && (
        <span id={messageId} className={error ? styles.error : styles.hint}>
          {error ?? hint}
        </span>
      )}
    </label>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, TextFieldProps>(function PasswordField(
  props,
  ref,
) {
  return <TextField ref={ref} type="password" autoComplete="current-password" {...props} />;
});

