import { type KeyboardEvent, useRef } from 'react';

import type { VpnClientProfile } from '#entities/vpnAccess';

import styles from './ProfileTabs.module.scss';

interface ProfileTabsProps {
  profiles: VpnClientProfile[];
  selectedEmail: string;
  panelId: string;
  idPrefix: string;
  onSelect: (email: string) => void;
}

export function ProfileTabs({
  profiles,
  selectedEmail,
  panelId,
  idPrefix,
  onSelect,
}: ProfileTabsProps) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectAt = (index: number) => {
    onSelect(profiles[index].email);
    tabs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % profiles.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + profiles.length) % profiles.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = profiles.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectAt(nextIndex);
  };

  return (
    <div className={styles.scroller}>
      <div className={styles.tabs} role="tablist" aria-label="VPN-профили">
        {profiles.map((profile, index) => {
          const selected = profile.email === selectedEmail;
          return (
            <button
              ref={(element) => { tabs.current[index] = element; }}
              type="button"
              role="tab"
              id={`${idPrefix}-${index}`}
              aria-controls={panelId}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              key={profile.email}
              onClick={() => onSelect(profile.email)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span aria-hidden="true" />
              {profile.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
