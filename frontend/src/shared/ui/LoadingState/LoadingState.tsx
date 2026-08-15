import styles from './LoadingState.module.scss';

export function LoadingState({ label = 'Загрузка' }: { label?: string }) {
  return (
    <div className={styles.loading} role="status">
      <span className={styles.orbit} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

