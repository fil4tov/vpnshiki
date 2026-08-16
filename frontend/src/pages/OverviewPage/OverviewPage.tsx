import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiPlus } from 'react-icons/fi';

import { getMyDailyCharge, myDailyChargeKey, useUserStore } from '#entities/user';
import { Button } from '#shared/ui';

import { ParticipationPulse, TopUpModal, VpnAccessPanel } from './components';
import styles from './OverviewPage.module.scss';

export function OverviewPage() {
  const user = useUserStore((state) => state.user)!;
  const [topUpOpen, setTopUpOpen] = useState(false);
  const dailyChargeQuery = useQuery({ queryKey: myDailyChargeKey, queryFn: getMyDailyCharge });

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div className={styles.headingCopy}>
          <p>Личный кабинет</p>
          <h1>Привет, {user.name}</h1>
        </div>
        <Button className={styles.topUpButton} onClick={() => setTopUpOpen(true)}>
          <FiPlus aria-hidden="true" />
          Пополнить
        </Button>
      </header>
      <ParticipationPulse
        accountStatus={user.account_status}
        balance={user.balance}
        negativeBalanceLimit={user.negative_balance_limit}
        dailyCharge={dailyChargeQuery.isPending ? undefined : dailyChargeQuery.data?.daily_charge ?? null}
      />
      <VpnAccessPanel accountStatus={user.account_status} />
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}
