/**
 * バッジチップの共通ベース。
 * 視覚は高さ 20px / 11px / pill。操作域は透明 padding で 24px 以上を確保する。
 * native <a> / <button> を使う (Shadow DOM のフォーカス委譲とキーボード a11y のため)。
 */
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  MouseEventHandler,
  ReactNode,
} from 'react';

const BASE =
  'inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-semibold ' +
  'no-underline cursor-pointer select-none whitespace-nowrap box-border ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 ' +
  // 透明ボーダーで操作域を広げる (視覚 20px → 操作 24px)
  'border-2 border-transparent bg-clip-padding -my-0.5';

export type ChipTone = 'cite' | 'oa' | 'doi' | 'hint' | 'neutral';

const TONES: Record<ChipTone, string> = {
  cite: 'bg-cite-bg text-cite-text hover:bg-[#d9eeeb]',
  oa: 'bg-oa-bg text-oa-text hover:bg-[#d8f0e0]',
  doi: 'bg-doi-bg text-doi-text hover:bg-[#e2e9f4]',
  hint: 'bg-hint-bg text-hint-text outline-1 -outline-offset-1 outline-dashed outline-hint-border hover:bg-[#eef2f6]',
  neutral: 'bg-surface-sunken text-ink-soft hover:bg-[#eceff3]',
};

interface ChipProps
  extends Omit<
    AnchorHTMLAttributes<HTMLAnchorElement> & ButtonHTMLAttributes<HTMLButtonElement>,
    'className' | 'type'
  > {
  tone: ChipTone;
  href?: string;
  onClick?: MouseEventHandler;
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * rest props (onFocus/onBlur/aria-describedby 等) は必ず DOM 要素へ転送する —
 * Tooltip が cloneElement で注入し、キーボードフォーカス時の表示に使うため。
 */
export function Chip({ tone, href, onClick, ariaLabel, children, ...rest }: ChipProps) {
  const className = `${BASE} ${TONES[tone]}`;
  if (href) {
    return (
      <a
        {...rest}
        className={className}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      {...rest}
      type="button"
      className={className}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
