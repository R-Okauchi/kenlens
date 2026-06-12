/**
 * 共有カードのプレビュー + コピー/保存ダイアログ (Shadow DOM 内モーダル)。
 * 生成はクライアント完結 (canvas)。どこにも送信しない。
 */
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { buildShareCard, renderShareCard, CARD_WIDTH, CARD_HEIGHT } from '@/lib/share/card';
import type { SummaryMetrics } from '@/lib/metrics/summary';

interface ShareDialogProps {
  metrics: SummaryMetrics;
  fetchedAt: number;
  onClose: () => void;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

export function ShareDialog({ metrics, fetchedAt, onClose }: ShareDialogProps) {
  const { t, locale } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (!canvasRef.current) return;
    renderShareCard(canvasRef.current, buildShareCard(metrics, locale, fetchedAt));
  }, [metrics, locale, fetchedAt]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // aria-modal の宣言どおり Tab をダイアログ内でループさせる
      // (抜けると SR には「隠された」背景ページを彷徨うことになる)
      if (e.key === 'Tab' && dialogRef.current) {
        const buttons = [...dialogRef.current.querySelectorAll<HTMLButtonElement>('button')];
        if (buttons.length === 0) return;
        const first = buttons[0]!;
        const last = buttons[buttons.length - 1]!;
        const root = dialogRef.current.getRootNode();
        const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
        if (e.shiftKey && (active === first || active === dialogRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const copy = async () => {
    try {
      const blob = await canvasToBlob(canvasRef.current!);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
    }
  };

  const save = async () => {
    const blob = await canvasToBlob(canvasRef.current!);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kenlens-summary.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[rgba(16,24,40,0.45)]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('share_dialog_title')}
        tabIndex={-1}
        className="kl-fade-in w-[600px] max-w-[92vw] rounded-lg bg-surface p-4 shadow-popover outline-none"
      >
        <div className="mb-2.5 flex items-center">
          <span className="text-md font-bold text-ink">{t('share_dialog_title')}</span>
          <button
            type="button"
            aria-label={t('share_close')}
            onClick={onClose}
            className="ml-auto inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-ink-soft outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            ✕
          </button>
        </div>

        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t('share_canvas_alt')}
          className="block w-full rounded-sm border border-border-default"
          style={{ aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}` }}
        />

        <p className="mt-2 mb-2.5 text-2xs leading-relaxed text-ink-soft">{t('share_note')}</p>

        <div className="flex items-center gap-2.5" aria-live="polite">
          <button
            type="button"
            onClick={() => void copy()}
            className="cursor-pointer rounded-md border-0 bg-brand px-4 py-1.5 text-sm font-bold text-white outline-none hover:bg-brand-strong focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {copyState === 'copied' ? t('share_copied') : t('share_copy')}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            className="cursor-pointer rounded-md border border-border-default bg-surface px-4 py-1.5 text-sm font-semibold text-ink outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {t('share_save')}
          </button>
          {copyState === 'failed' && (
            <span className="text-2xs text-ink-soft">{t('share_copy_failed')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
