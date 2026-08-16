import { QRCodeSVG } from 'qrcode.react';

import { Modal } from '#shared/ui';

import { CopyButton } from '../CopyButton';
import styles from './VpnQrModal.module.scss';

interface VpnQrModalProps {
  open: boolean;
  title: string;
  url: string;
  onClose: () => void;
  onCopy: () => Promise<boolean>;
}

export function VpnQrModal({ open, title, url, onClose, onCopy }: VpnQrModalProps) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className={styles.content}>
        <p>Откройте VPN-приложение и отсканируйте код камерой.</p>
        <div className={styles.qr}>
          <QRCodeSVG value={url} size={384} level="M" bgColor="#ffffff" fgColor="#17121d" title={`QR-код: ${title}`} />
        </div>
        <CopyButton fullWidth label="Скопировать ссылку" onCopy={onCopy} variant="primary" />
        <small>QR-код содержит секретную ссылку подключения. Не передавайте его другим людям.</small>
      </div>
    </Modal>
  );
}
