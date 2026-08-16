import { useEffect, useRef, useState } from 'react';
import { FiCheck, FiCopy } from 'react-icons/fi';

import { Button } from '#shared/ui';

import styles from './CopyButton.module.scss';

interface CopyButtonProps {
  className?: string;
  fullWidth?: boolean;
  label: string;
  onCopy: () => Promise<boolean>;
  variant?: 'primary' | 'secondary';
}

const COPIED_STATE_DURATION = 2000;

export function CopyButton({
  className = '',
  fullWidth = false,
  label,
  onCopy,
  variant = 'secondary',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = async () => {
    const successful = await onCopy();
    if (!successful) return;

    setCopied(true);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), COPIED_STATE_DURATION);
  };

  return (
    <Button
      type="button"
      className={`${styles.button} ${copied ? styles.copied : ''} ${className}`}
      data-copy-state={copied ? 'copied' : 'idle'}
      fullWidth={fullWidth}
      variant={variant}
      onClick={() => void handleCopy()}
    >
      <span className={styles.icon} aria-hidden="true">
        <FiCopy className={styles.copyIcon} />
        <FiCheck className={styles.checkIcon} />
      </span>
      {label}
    </Button>
  );
}
