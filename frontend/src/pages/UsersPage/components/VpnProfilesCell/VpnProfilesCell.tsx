import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { AdminUser } from '#entities/user';

import styles from './VpnProfilesCell.module.scss';

const VIEWPORT_MARGIN = 12;
const TOOLTIP_GAP = 8;

interface TooltipPosition {
  left: number;
  placement: 'above' | 'below';
  top: number;
}

interface VpnProfilesCellProps {
  profiles: AdminUser['vpnProfiles'];
  userName: string;
}

function profileCountLabel(count: number) {
  const modulo100 = count % 100;
  const modulo10 = count % 10;
  if (modulo100 >= 11 && modulo100 <= 14) return `${count} VPN-профилей`;
  if (modulo10 === 1) return `${count} VPN-профиль`;
  if (modulo10 >= 2 && modulo10 <= 4) return `${count} VPN-профиля`;
  return `${count} VPN-профилей`;
}

export function VpnProfilesCell({ profiles, userName }: VpnProfilesCellProps) {
  const tooltipId = `${useId()}-vpn-profiles`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const count = profiles?.length ?? 0;
  const triggerLabel = profiles === null
    ? `Данные VPN-профилей пользователя ${userName} недоступны`
    : count === 0
      ? `Нет VPN-профилей у пользователя ${userName}`
      : `${profileCountLabel(count)} у пользователя ${userName}`;

  useLayoutEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;
      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const centeredLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      const left = Math.min(
        window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN,
        Math.max(VIEWPORT_MARGIN, centeredLeft),
      );
      const aboveTop = triggerRect.top - tooltipRect.height - TOOLTIP_GAP;
      const placement = aboveTop >= VIEWPORT_MARGIN ? 'above' : 'below';
      setPosition({
        left,
        placement,
        top: placement === 'above' ? aboveTop : triggerRect.bottom + TOOLTIP_GAP,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setPosition(null);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setPosition(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${profiles === null ? styles.unavailable : ''}`}
        aria-label={triggerLabel}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={close}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onPointerDown={(event) => {
          if (event.pointerType !== 'touch') return;
          event.preventDefault();
          if (open) close();
          else setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          close();
          triggerRef.current?.blur();
        }}
      >
        {profiles === null ? '—' : count}
      </button>
      {open && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className={styles.tooltip}
          data-placement={position?.placement}
          style={{
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            visibility: position ? 'visible' : 'hidden',
          }}
        >
          {profiles === null ? (
            <p>Не удалось получить данные из VPN-панели</p>
          ) : profiles.length === 0 ? (
            <p>VPN-профили не найдены</p>
          ) : (
            <>
              <div className={styles.profileHeader}>
                <strong>Профили пользователя</strong>
              </div>
              <ul>
                {profiles.map((profile) => {
                  const online = profile.status === 'online';
                  const statusLabel = online ? 'В сети' : 'Не в сети';
                  const enabledLabel = profile.enabled ? 'Профиль включён' : 'Профиль выключен';
                  return (
                    <li key={profile.label}>
                      <span
                        className={`${styles.indicator} ${online ? styles.online : styles.offline}`}
                        aria-label={statusLabel}
                      />
                      <div className={styles.profileDetails}>
                        <span className={styles.profileName}>{profile.label}</span>
                        <small>{statusLabel}</small>
                      </div>
                      <span
                        className={`${styles.enabledState} ${profile.enabled ? styles.enabled : styles.disabled}`}
                        aria-label={enabledLabel}
                      >
                        {profile.enabled ? 'Включён' : 'Выключен'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
