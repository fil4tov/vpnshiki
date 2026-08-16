import { FiGrid } from 'react-icons/fi';

import type { VpnConnection } from '#entities/vpnAccess';
import { Button } from '#shared/ui';

import { CopyButton } from '../CopyButton';
import styles from './ProfileList.module.scss';

interface ProfileListProps {
  connections: VpnConnection[];
  onCopy: (url: string) => Promise<boolean>;
  onShowQr: (connection: VpnConnection) => void;
}

function protocolLabel(protocol: string) {
  return protocol.toLowerCase() === 'hysteria2' ? 'Hysteria2' : protocol.toUpperCase();
}

export function ProfileList({ connections, onCopy, onShowQr }: ProfileListProps) {
  return (
    <article className={styles.panel} aria-label="Отдельные подключения">
      <header className={styles.heading}>
        <h3>Отдельные подключения</h3>
        {connections.length > 0 && <span><i aria-hidden="true" />Все доступны</span>}
      </header>
      {connections.length === 0 ? (
        <div className={styles.empty}>
          <strong>Отдельных подключений пока нет</strong>
          <p>Используйте единую подписку — она уже доступна слева.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {connections.map((connection) => (
            <section className={styles.profile} key={connection.url} aria-label={connection.name}>
              <div className={styles.details}>
                <div className={styles.tags}>
                  <span className={connection.protocol === 'hysteria2' ? styles.hysteria : styles.vless}>
                    {protocolLabel(connection.protocol)}
                  </span>
                  {connection.transport && <span className={styles.transport}>{connection.transport.toUpperCase()}</span>}
                  {connection.security && (
                    <span className={connection.security === 'tls' ? styles.tls : styles.security}>
                      {connection.security.toUpperCase()}
                    </span>
                  )}
                </div>
                <p title={connection.name}>{connection.name}</p>
              </div>
              <div className={styles.actions}>
                <CopyButton className={styles.copyButton} label="Копировать" onCopy={() => onCopy(connection.url)} />
                <Button
                  variant="secondary"
                  className={styles.qrButton}
                  onClick={() => onShowQr(connection)}
                  aria-label={`Показать QR ${connection.name}`}
                  title="Показать QR"
                >
                  <FiGrid />
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
