import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiPlus } from 'react-icons/fi';

import { getMyDailyCharge, myDailyChargeKey, useUserStore } from '#entities/user';
import { Button } from '#shared/ui';

import { ParticipationPulse, RecommendedVpnClients, TopUpModal, VpnAccessPanel } from './components';
import styles from './OverviewPage.module.scss';

export function OverviewPage() {
  const user = useUserStore((state) => state.user)!;
  const [topUpOpen, setTopUpOpen] = useState(false);
  const active = user.account_status === 'active';
  const canTopUp = user.account_status !== 'blocked' || user.block_source !== 'admin';
  const dailyChargeQuery = useQuery({
    queryKey: myDailyChargeKey,
    queryFn: getMyDailyCharge,
    enabled: active,
  });

  return (
    <div className={styles.page}>
      <div className={styles.accountOverview}>
        <header className={styles.heading}>
          <div className={styles.headingCopy}>
            <p>Личный кабинет</p>
            <h1>Привет, {user.name}</h1>
          </div>
        </header>
        <div className={styles.participation}>
          <ParticipationPulse
            accountStatus={user.account_status}
            blockSource={user.block_source}
            balance={user.balance}
            negativeBalanceLimit={user.negative_balance_limit}
            dailyCharge={active && dailyChargeQuery.isPending
              ? undefined
              : dailyChargeQuery.data?.daily_charge ?? null}
            mobileAction={canTopUp ? (
              <Button className={styles.mobileTopUpButton} onClick={() => setTopUpOpen(true)}>
                <FiPlus aria-hidden="true" />
                Пополнить
              </Button>
            ) : null}
          />
        </div>
        {canTopUp && (
          <Button className={styles.desktopTopUpButton} onClick={() => setTopUpOpen(true)}>
            <FiPlus aria-hidden="true" />
            Пополнить
          </Button>
        )}
      </div>
      <VpnAccessPanel accountStatus={user.account_status} />
      {active && <RecommendedVpnClients />}
      {canTopUp && <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />}
    </div>
  );
}
