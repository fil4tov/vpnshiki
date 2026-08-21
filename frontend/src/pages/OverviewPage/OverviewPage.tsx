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
      <header className={styles.heading}>
        <div className={styles.headingCopy}>
          <p>Личный кабинет</p>
          <h1>Привет, {user.name}</h1>
        </div>
        {canTopUp && (
          <Button className={styles.topUpButton} onClick={() => setTopUpOpen(true)}>
            <FiPlus aria-hidden="true" />
            Пополнить
          </Button>
        )}
      </header>
      <ParticipationPulse
        accountStatus={user.account_status}
        blockSource={user.block_source}
        balance={user.balance}
        negativeBalanceLimit={user.negative_balance_limit}
        dailyCharge={active && dailyChargeQuery.isPending
          ? undefined
          : dailyChargeQuery.data?.daily_charge ?? null}
      />
      <VpnAccessPanel accountStatus={user.account_status} />
      {active && <RecommendedVpnClients />}
      {canTopUp && <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />}
    </div>
  );
}
