import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { FiAlertCircle, FiLock, FiPauseCircle, FiRefreshCw } from 'react-icons/fi';

import { getMyVpnAccess, myVpnAccessKey } from '#entities/vpnAccess';
import type { VpnConnection } from '#entities/vpnAccess';
import type { AccountStatus } from '#entities/user';
import { ApiError } from '#shared/api';
import { Button } from '#shared/ui';

import { ProfileList, ProfileTabs, SubscriptionCard, VpnQrModal } from './components';
import styles from './VpnAccessPanel.module.scss';
import { copyToClipboard } from './utils';

interface QrTarget {
  title: string;
  url: string;
}

interface VpnAccessPanelProps {
  accountStatus: AccountStatus;
}

function profileCountLabel(count: number) {
  const remainder = count % 100;
  if (remainder >= 11 && remainder <= 14) return `${count} профилей`;
  if (count % 10 === 1) return `${count} профиль`;
  if (count % 10 >= 2 && count % 10 <= 4) return `${count} профиля`;
  return `${count} профилей`;
}

export function VpnAccessPanel({ accountStatus }: VpnAccessPanelProps) {
  const active = accountStatus === 'active';
  const accessQuery = useQuery({
    queryKey: myVpnAccessKey,
    queryFn: getMyVpnAccess,
    enabled: active,
  });
  const [qrTarget, setQrTarget] = useState<QrTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preferredEmail, setPreferredEmail] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const profilePanelId = `${useId()}-vpn-profile-panel`;
  const profileTabIdPrefix = `${profilePanelId}-tab`;

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const copy = async (url: string) => {
    let successful = false;
    try {
      await copyToClipboard(url);
      setNotice('Ссылка скопирована');
      successful = true;
    } catch {
      setNotice('Не удалось скопировать ссылку');
    }
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2200);
    return successful;
  };

  const showConnectionQr = (connection: VpnConnection) => {
    setQrTarget({ title: connection.name, url: connection.url });
  };

  if (!active) {
    const blocked = accountStatus === 'blocked';
    return (
      <section className={styles.section} aria-labelledby="vpn-heading">
        <div className={styles.heading}><h2 id="vpn-heading">Ваш VPN</h2></div>
        <div className={styles.unavailable}>
          <span className={styles.stateIcon}>{blocked ? <FiLock /> : <FiPauseCircle />}</span>
          <h3>VPN доступен только для активного аккаунта</h3>
        </div>
      </section>
    );
  }

  if (accessQuery.isPending) {
    return (
      <section className={styles.section} aria-labelledby="vpn-heading" aria-busy="true">
        <div className={styles.heading}><h2 id="vpn-heading">Ваш VPN</h2></div>
        <div className={styles.skeleton} role="status" aria-label="Загрузка VPN-подключений">
          <span /><span />
        </div>
      </section>
    );
  }

  if (accessQuery.isError) {
    const error = accessQuery.error;
    const notFound = error instanceof ApiError && error.code === 'vpn_profile_not_found';
    const unconfigured = error instanceof ApiError && error.code === 'vpn_integration_unconfigured';
    return (
      <section className={styles.section} aria-labelledby="vpn-heading">
        <div className={styles.heading}><h2 id="vpn-heading">Ваш VPN</h2></div>
        <div className={styles.errorState} role="alert">
          <span className={styles.stateIcon}><FiAlertCircle /></span>
          <div>
            <h3>{notFound ? 'VPN-профиль не найден' : unconfigured ? 'Интеграция VPN ещё не настроена' : 'Не удалось загрузить VPN-подключения'}</h3>
            <p>{notFound || unconfigured ? 'Обратитесь к администратору — он проверит профиль и настройки панели.' : 'Проверьте подключение и попробуйте запросить данные ещё раз.'}</p>
          </div>
          {!notFound && !unconfigured && (
            <Button variant="secondary" onClick={() => void accessQuery.refetch()}><FiRefreshCw />Повторить</Button>
          )}
        </div>
      </section>
    );
  }

  const access = accessQuery.data;
  const selectedProfile = access.profiles.find((profile) => profile.email === preferredEmail)
    ?? access.profiles[0];
  if (!selectedProfile) {
    return (
      <section className={styles.section} aria-labelledby="vpn-heading">
        <div className={styles.heading}><h2 id="vpn-heading">Ваш VPN</h2></div>
        <div className={styles.errorState} role="alert">
          <span className={styles.stateIcon}><FiAlertCircle /></span>
          <div>
            <h3>VPN-профиль не найден</h3>
            <p>Обратитесь к администратору — он проверит профиль и настройки панели.</p>
          </div>
        </div>
      </section>
    );
  }
  const selectedIndex = access.profiles.indexOf(selectedProfile);
  const multipleProfiles = access.profiles.length > 1;
  const selectProfile = (email: string) => {
    setPreferredEmail(email);
    setQrTarget(null);
  };
  const subscriptionQrTitle = multipleProfiles
    ? `Общая подписка — ${selectedProfile.label}`
    : 'Общая подписка';
  return (
    <section className={styles.section} aria-labelledby="vpn-heading">
      <div className={styles.heading}>
        <h2 id="vpn-heading">Ваш VPN</h2>
        <span>{profileCountLabel(access.profiles.length)}</span>
      </div>
      {multipleProfiles && (
        <ProfileTabs
          profiles={access.profiles}
          selectedEmail={selectedProfile.email}
          panelId={profilePanelId}
          idPrefix={profileTabIdPrefix}
          onSelect={selectProfile}
        />
      )}
      <div
        className={styles.layout}
        id={profilePanelId}
        role={multipleProfiles ? 'tabpanel' : undefined}
        aria-labelledby={multipleProfiles ? `${profileTabIdPrefix}-${selectedIndex}` : undefined}
      >
        <SubscriptionCard
          onCopy={() => copy(selectedProfile.subscription_url)}
          onShowQr={() => setQrTarget({
            title: subscriptionQrTitle,
            url: selectedProfile.subscription_url,
          })}
        />
        <ProfileList
          connections={selectedProfile.connections}
          onCopy={copy}
          onShowQr={showConnectionQr}
        />
      </div>
      <VpnQrModal
        open={qrTarget !== null}
        title={qrTarget?.title ?? ''}
        url={qrTarget?.url ?? ''}
        onClose={() => setQrTarget(null)}
        onCopy={() => qrTarget ? copy(qrTarget.url) : Promise.resolve(false)}
      />
      {notice && <div className={styles.notice} role="status"><i aria-hidden="true" />{notice}</div>}
    </section>
  );
}
