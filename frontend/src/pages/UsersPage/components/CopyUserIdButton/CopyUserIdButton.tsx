import { useEffect, useRef, useState } from 'react';
import { FiCheck, FiCopy } from 'react-icons/fi';

import { TableActionButton } from '#shared/ui';

import styles from './CopyUserIdButton.module.scss';

const COPIED_STATE_DURATION = 1600;

export function CopyUserIdButton({ id, name }: { id: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  const copy = async () => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), COPIED_STATE_DURATION);
    } catch {
      // Clipboard access may be unavailable outside a secure browser context.
    }
  };

  return (
    <TableActionButton
      className={styles.button}
      data-copy-state={copied ? 'copied' : 'idle'}
      title={copied ? 'ID скопирован' : 'Скопировать ID'}
      aria-label={`Скопировать ID пользователя ${name}`}
      onClick={() => void copy()}
    >
      {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
    </TableActionButton>
  );
}
