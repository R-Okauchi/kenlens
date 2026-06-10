/**
 * MV3 service worker: 全 fetch・キャッシュ・レート制限・縮退判定の単一窓口。
 * SW はアイドル 30 秒で死ぬため、ここではメモリ状態を持たない
 * (キャッシュは storage.local、ブレーカ状態は kl:flags に永続化する)。
 */
import { defineBackground } from '#imports';
import { registerBackgroundHandlers } from '@/lib/background/handlers';

export default defineBackground(() => {
  registerBackgroundHandlers();
});
