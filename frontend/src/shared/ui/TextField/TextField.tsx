import { forwardRef, useId, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';

import styles from './TextField.module.scss';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  endAdornment?: ReactNode;
  inputClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, endAdornment, id, className = '', inputClassName = '', ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  return (
    <div className={`${styles.field} ${className}`}>
      <label className={styles.label} htmlFor={inputId}>{label}</label>
      <div className={styles.inputWrapper}>
        <input
          ref={ref}
          id={inputId}
          className={`${styles.input} ${endAdornment ? styles.inputWithAdornment : ''} ${error ? styles.invalid : ''} ${inputClassName}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? messageId : undefined}
          {...props}
        />
        {endAdornment}
      </div>
      {(error || hint) && (
        <span id={messageId} className={error ? styles.error : styles.hint}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
});

interface PasswordFieldProps extends TextFieldProps {
  visible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { visible: controlledVisible, onVisibilityChange, endAdornment, inputClassName = '', ...props },
  ref,
) {
  const [internalVisible, setInternalVisible] = useState(false);
  const visible = controlledVisible ?? internalVisible;
  const actionLabel = visible ? 'Скрыть пароль' : 'Показать пароль';

  const toggleVisibility = () => {
    const nextVisible = !visible;
    setInternalVisible(nextVisible);
    onVisibilityChange?.(nextVisible);
  };

  return (
    <TextField
      ref={ref}
      autoComplete="current-password"
      {...props}
      type={visible ? 'text' : 'password'}
      inputClassName={`${endAdornment ? styles.inputWithPasswordActions : ''} ${inputClassName}`}
      endAdornment={(
        <div className={styles.passwordActions}>
          {endAdornment}
          <button
            className={styles.passwordToggle}
            type="button"
            aria-label={actionLabel}
            aria-pressed={visible}
            title={actionLabel}
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggleVisibility}
          >
            {visible ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
          </button>
        </div>
      )}
    />
  );
});
