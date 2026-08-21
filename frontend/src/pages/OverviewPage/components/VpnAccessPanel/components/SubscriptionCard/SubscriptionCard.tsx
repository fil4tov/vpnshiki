import { BsQrCodeScan } from 'react-icons/bs';

import { Button } from '#shared/ui';

import { CopyButton } from '../CopyButton';
import styles from './SubscriptionCard.module.scss';

interface SubscriptionCardProps {
  onCopy: () => Promise<boolean>;
  onShowQr: () => void;
}

export function SubscriptionCard({ onCopy, onShowQr }: SubscriptionCardProps) {
  return (
    <article className={styles.card} aria-label="Единая подписка">
      <h3 className={styles.heading}><i aria-hidden="true" />Единая подписка</h3>
      <div className={styles.orbit} aria-hidden="true">
        <span className={styles.orbitTrack} />
        <span className={styles.core}>V</span>
      </div>
      <div className={styles.copy}>
        <strong>Одно подключение.<br />Все маршруты.</strong>
        <p>Добавьте подписку один раз — новые серверы появятся автоматически.</p>
      </div>
      <div className={styles.actions}>
        <CopyButton className={styles.copyButton} label="Скопировать ссылку" onCopy={onCopy} />
        <Button
          className={styles.qrButton}
          variant="secondary"
          onClick={onShowQr}
          aria-label="Показать QR общей подписки"
          title="Показать QR"
        >
          <BsQrCodeScan />
        </Button>
      </div>
    </article>
  );
}
