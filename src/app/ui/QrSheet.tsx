// QR code for joining an activity. Generated with the `qrcode` library from the
// group invite link. The user can copy the QR image or the link.
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { store } from '../data/store';
import { BottomSheet, Button } from './kit';
import { IconCopy } from './icons';

export function QrSheet({ url, onClose }: { url: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: '#141610', light: '#ffffff' } })
      .then((d) => {
        if (alive) setDataUrl(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      store.toast('Povezava kopirana');
    } catch {
      store.toast('Kopiranje ni uspelo');
    }
  };

  const copyImage = async () => {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const anyClipboard = navigator.clipboard as unknown as {
        write?: (items: unknown[]) => Promise<void>;
      };
      const ClipItem = (window as unknown as { ClipboardItem?: new (i: Record<string, Blob>) => unknown }).ClipboardItem;
      if (anyClipboard.write && ClipItem) {
        await anyClipboard.write([new ClipItem({ [blob.type]: blob })]);
        store.toast('QR koda kopirana');
      } else {
        await copyLink();
      }
    } catch {
      await copyLink();
    }
  };

  return (
    <BottomSheet title="QR koda za pridružitev" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 240, height: 240, borderRadius: 18, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {dataUrl ? <img src={dataUrl} width={224} height={224} alt="QR koda" /> : null}
        </div>
        <div style={{ font: '400 13px/1.5 Rubik', color: 'var(--text-sec)', textAlign: 'center' }}>
          Skeniraj kodo za pridružitev aktivnosti — ali kopiraj in deli povezavo.
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <Button variant="secondary" full onClick={copyImage} disabled={!dataUrl}>
            <IconCopy size={16} color="var(--link)" strokeWidth={2} /> Kopiraj QR
          </Button>
          <Button variant="secondary" full onClick={copyLink}>
            <IconCopy size={16} color="var(--link)" strokeWidth={2} /> Kopiraj povezavo
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
