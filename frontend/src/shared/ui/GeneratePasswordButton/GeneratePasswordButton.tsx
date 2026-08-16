import { FiRefreshCw } from 'react-icons/fi';

import { generatePassword } from '#shared/lib/password';

import styles from './GeneratePasswordButton.module.scss';

interface GeneratePasswordButtonProps {
  onGenerate: (password: string) => void;
}

export function GeneratePasswordButton({ onGenerate }: GeneratePasswordButtonProps) {
  return (
    <button
      className={styles.button}
      type="button"
      aria-label="Сгенерировать пароль"
      title="Сгенерировать пароль"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onGenerate(generatePassword())}
    >
      <FiRefreshCw aria-hidden="true" />
    </button>
  );
}
