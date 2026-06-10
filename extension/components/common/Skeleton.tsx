/**
 * スケルトン。0–500ms は何も出さず (高さはホスト要素で確保済み)、
 * 500ms を超えたら shimmer pill を表示する。reduced-motion は CSS 側で静的化。
 */
import { useEffect, useState } from 'react';

export function Skeleton({ delayMs = 500 }: { delayMs?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  if (!visible) return null;
  return <span className="kl-skeleton inline-block h-5 w-[60px]" aria-hidden="true" />;
}
