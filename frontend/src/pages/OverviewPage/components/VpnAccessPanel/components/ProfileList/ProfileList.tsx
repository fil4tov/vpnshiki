import { FiGrid } from 'react-icons/fi';

import type { VpnProfile } from '#entities/vpnAccess';
import { Button } from '#shared/ui';

import { CopyButton } from '../CopyButton';
import styles from './ProfileList.module.scss';

interface ProfileListProps {
  profiles: VpnProfile[];
  onCopy: (url: string) => Promise<boolean>;
  onShowQr: (profile: VpnProfile) => void;
}

function protocolLabel(protocol: string) {
  return protocol.toLowerCase() === 'hysteria2' ? 'Hysteria2' : protocol.toUpperCase();
}

export function ProfileList({ profiles, onCopy, onShowQr }: ProfileListProps) {
  return (
    <article className={styles.panel} aria-label="Отдельные подключения">
      <header className={styles.heading}>
        <h3>Отдельные подключения</h3>
        {profiles.length > 0 && <span><i aria-hidden="true" />Все доступны</span>}
      </header>
      {profiles.length === 0 ? (
        <div className={styles.empty}>
          <strong>Отдельных подключений пока нет</strong>
          <p>Используйте единую подписку — она уже доступна слева.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {profiles.map((profile) => (
            <section className={styles.profile} key={profile.url} aria-label={profile.name}>
              <div className={styles.details}>
                <div className={styles.tags}>
                  <span className={profile.protocol === 'hysteria2' ? styles.hysteria : styles.vless}>
                    {protocolLabel(profile.protocol)}
                  </span>
                  {profile.transport && <span className={styles.transport}>{profile.transport.toUpperCase()}</span>}
                  {profile.security && (
                    <span className={profile.security === 'tls' ? styles.tls : styles.security}>
                      {profile.security.toUpperCase()}
                    </span>
                  )}
                </div>
                <p title={profile.name}>{profile.name}</p>
              </div>
              <div className={styles.actions}>
                <CopyButton className={styles.copyButton} label="Копировать" onCopy={() => onCopy(profile.url)} />
                <Button
                  variant="secondary"
                  className={styles.qrButton}
                  onClick={() => onShowQr(profile)}
                  aria-label={`Показать QR ${profile.name}`}
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
