import { useId, useMemo, useState } from 'react';
import { BsQrCodeScan } from 'react-icons/bs';
import { FiChevronDown, FiLayers } from 'react-icons/fi';

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

function connectionCountLabel(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const noun = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? 'подключений'
    : lastDigit === 1
      ? 'подключение'
      : lastDigit >= 2 && lastDigit <= 4
        ? 'подключения'
        : 'подключений';

  return `${count} ${noun} для ручной настройки`;
}

function connectionVariantLabel(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const noun = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? 'вариантов'
    : lastDigit === 1
      ? 'вариант'
      : lastDigit >= 2 && lastDigit <= 4
        ? 'варианта'
        : 'вариантов';

  return `${count} ${noun} для приложений без подписки.`;
}

export function ProfileList({
  connections,
  onCopy,
  onShowQr,
}: ProfileListProps) {
  const [open, setOpen] = useState(false);
  const sortedConnections = useMemo(
    () => [...connections].sort((first, second) => (
      second.protocol.localeCompare(first.protocol, 'en', { sensitivity: 'base' })
    )),
    [connections],
  );
  const listId = `${useId()}-connection-list`;
  const connectionCount = connectionCountLabel(connections.length);
  const connectionVariants = connectionVariantLabel(connections.length);
  const connectionList = connections.length === 0 ? (
    <div className={styles.empty}>
      <strong>Отдельных подключений пока нет</strong>
      <p>Используйте единую подписку — она уже доступна выше.</p>
    </div>
  ) : (
    <div className={styles.list}>
      {sortedConnections.map((connection) => (
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
              <BsQrCodeScan />
            </Button>
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <article className={styles.panel} data-open={open} aria-label="Отдельные подключения">
      <button
        type="button"
        className={styles.toggle}
        aria-label={open ? 'Скрыть отдельные подключения' : 'Показать отдельные подключения'}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.closedSummary} aria-hidden="true">
          <span className={styles.summaryHeading}><i />Отдельные подключения</span>
          <span className={styles.stackComposition}>
            <span className={styles.stack}>
              <i />
              <i />
              <i><FiLayers /></i>
            </span>
            <span className={styles.stackCopy}>
              <strong>Конфигурации по отдельности</strong>
              <small>{connectionVariants}</small>
            </span>
          </span>
          <span className={styles.openHint}>Открыть список <FiChevronDown /></span>
        </span>
        <span className={styles.openSummary} aria-hidden="true">
          <span className={styles.summaryIcon}><FiLayers /></span>
          <span className={styles.summaryCopy}>
            <strong>Отдельные подключения</strong>
            <small>{connectionCount}</small>
          </span>
          <FiChevronDown className={styles.chevron} />
        </span>
      </button>
      <div
        id={listId}
        className={styles.listBody}
        aria-hidden={!open}
        inert={!open}
      >
        {connectionList}
      </div>
    </article>
  );
}
