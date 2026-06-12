/**
 * 共有カード (v0.4)。サマリーの数値を 1200x675 (X タイムライン最適) の PNG に描く。
 *
 * ガードレール (画像に永続的に焼き込まれる):
 * - 研究者名・permalink は載せない (匿名カード — 文脈は投稿者が添える)
 * - 率は分数主表示、被引用には照合分母を必ず併記
 * - 免責文とデータクレジットを必ず含める
 * - 全数値は同一インク色 (大小の色分けなし)
 * - 描画はクライアント完結 (canvas)。外部送信ゼロ
 */
import { DISCLAIMER, DATA_CREDITS, POWERED_BY } from '@kenlens/shared/disclaimer';
import type { Locale } from '../i18n';
import { formatDate, t } from '../i18n';
import type { SummaryMetrics } from '../metrics/summary';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 675;

interface Tile {
  value: string;
  label: string;
  foot: string | null;
}

export interface ShareCardData {
  title: string;
  asOf: string;
  /** 先頭が主役タイル (DOI登録) */
  tiles: Tile[];
  disclaimer: string;
  credit: string;
}

const pct = (n: number, d: number) => (d > 0 ? ` (${Math.round((n / d) * 100)}%)` : '');

export function buildShareCard(
  metrics: SummaryMetrics,
  locale: Locale,
  fetchedAtMs: number,
): ShareCardData {
  const ja = locale === 'ja';
  const { doi, oa, citations, papers5y, range, totalPapers } = metrics;

  const tiles: Tile[] = [
    {
      value: `${doi.count} / ${doi.total}`,
      label: (ja ? 'DOI登録' : 'With DOI') + pct(doi.count, doi.total),
      foot: ja ? `全論文${doi.total}件中` : `of all ${doi.total} papers`,
    },
    {
      value: String(papers5y),
      label: ja ? '直近5年の論文' : 'Papers, last 5 yrs',
      // 範囲は脚注へ。右列の脚注幅は狭いので簡潔に (researchmap 由来はクレジット行で既知)
      foot: ja
        ? `${range.from}–${range.to}年の登録分`
        : `${range.from}–${range.to}, researchmap`,
    },
    {
      value: oa.resolvable > 0 ? `${oa.count} / ${oa.resolvable}` : '—',
      label: (ja ? 'OA論文' : 'OA papers') + pct(oa.count, oa.resolvable),
      foot: ja ? `判定可能${oa.resolvable}件中` : `of ${oa.resolvable} resolvable`,
    },
    {
      value: citations.total.toLocaleString(),
      label: ja ? '被引用 (累計)' : 'Citations (total)',
      foot: ja
        ? `照合済み${citations.matched}/${totalPapers}件 (OpenAlex)`
        : `across ${citations.matched}/${totalPapers} matched (OpenAlex)`,
    },
  ];

  return {
    title: ja ? '研レンズで見た研究プロフィール' : 'A research profile, seen through KenLens',
    asOf: ja
      ? `${formatDate(locale, fetchedAtMs)}時点`
      : `as of ${formatDate(locale, fetchedAtMs)}`,
    tiles,
    disclaimer: `※ ${DISCLAIMER[locale]}`,
    credit: `${POWERED_BY.label}${t(locale, 'sep_credit')}${DATA_CREDITS[locale]}`,
  };
}

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif';

const INK = '#1f2937';
const INK_SOFT = '#667085';
const BRAND_STRONG = '#0b5e57';
const BORDER = '#e4e7ec';

/** dpr=2 で 2400x1350 の実ピクセルに描く (X 添付時の文字の滲み防止) */
export function renderShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  dpr = 2,
): void {
  canvas.width = CARD_WIDTH * dpr;
  canvas.height = CARD_HEIGHT * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  // 背景 + 枠 + 上辺グラデ
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, CARD_WIDTH - 2, CARD_HEIGHT - 2);
  const grad = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  grad.addColorStop(0, '#0d9488');
  grad.addColorStop(1, '#0ea5e9');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_WIDTH, 10);

  const pad = 72;

  // ヘッダー: レンズグリフ + タイトル / 右端に取得時点
  const hy = 96;
  ctx.strokeStyle = BRAND_STRONG;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(pad + 17, hy - 6, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pad + 29, hy + 6);
  ctx.lineTo(pad + 41, hy + 18);
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = `bold 36px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(data.title, pad + 60, hy);

  ctx.fillStyle = INK_SOFT;
  ctx.font = `24px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(data.asOf, CARD_WIDTH - pad, hy);
  ctx.textAlign = 'left';

  // 罫線
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, 150);
  ctx.lineTo(CARD_WIDTH - pad, 150);
  ctx.stroke();

  // タイル: 主役 (DOI登録) は左に大きく、残り 3 つは右に縦積み
  const [hero, ...rest] = data.tiles;
  const tileTop = 200;

  ctx.fillStyle = INK;
  ctx.font = `bold 104px ${FONT}`;
  ctx.fillText(hero!.value, pad, tileTop + 60);
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText(hero!.label, pad, tileTop + 150);
  if (hero!.foot) {
    ctx.fillStyle = INK_SOFT;
    ctx.font = `24px ${FONT}`;
    ctx.fillText(hero!.foot, pad, tileTop + 196);
  }

  const colX = 640;
  rest.forEach((tile, i) => {
    const y = tileTop - 10 + i * 110;
    ctx.fillStyle = INK;
    ctx.font = `bold 48px ${FONT}`;
    ctx.fillText(tile.value, colX, y + 18);
    ctx.font = `26px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(tile.label, colX + 250, y + 4);
    if (tile.foot) {
      ctx.fillStyle = INK_SOFT;
      ctx.font = `21px ${FONT}`;
      ctx.fillText(tile.foot, colX + 250, y + 36);
    }
  });

  // フッター: 免責 (ブランド色) + クレジット
  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(pad, 545);
  ctx.lineTo(CARD_WIDTH - pad, 545);
  ctx.stroke();

  ctx.fillStyle = BRAND_STRONG;
  ctx.font = `26px ${FONT}`;
  ctx.fillText(data.disclaimer, pad, 588);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `23px ${FONT}`;
  ctx.fillText(data.credit, pad, 630);
}
