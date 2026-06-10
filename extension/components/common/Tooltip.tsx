/**
 * カスタムツールチップ (Shadow DOM 内)。
 * WCAG 1.4.13: hover 可能 (leave 後 100ms 猶予)・Esc で消去・持続表示。
 * 出現 300ms delay。ビューポート上端 60px 以内なら下側にフリップ。
 * 内容には必ず出典と時点を含めること (呼び出し側の責務)。
 */
import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactElement<Record<string, unknown>>;
}

export function Tooltip({ content, children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [below, setBelow] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
  };

  const show = useCallback((immediate = false) => {
    clearTimers();
    const doShow = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      setBelow((rect?.top ?? 100) < 60);
      setOpen(true);
    };
    if (immediate) doShow();
    else showTimer.current = setTimeout(doShow, 300);
  }, []);

  const hide = useCallback((immediate = false) => {
    clearTimers();
    if (immediate) setOpen(false);
    else hideTimer.current = setTimeout(() => setOpen(false), 100);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  useEffect(() => clearTimers, []);

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => show()}
      onMouseLeave={() => hide()}
    >
      {cloneElement(children, {
        'aria-describedby': open ? id : undefined,
        // 子の既存ハンドラを潰さず合成する。表示はキーボードフォーカス
        // (:focus-visible) のみ — タブ復帰時のプログラム的フォーカスで
        // ツールチップが勝手に開き直すのを防ぐ
        onFocus: (e: FocusEvent & { currentTarget: HTMLElement }) => {
          (children.props.onFocus as ((e: unknown) => void) | undefined)?.(e);
          if (e.currentTarget.matches(':focus-visible')) show(true);
        },
        onBlur: (e: unknown) => {
          (children.props.onBlur as ((e: unknown) => void) | undefined)?.(e);
          hide(true);
        },
      })}
      {open && (
        <span
          id={id}
          role="tooltip"
          onMouseEnter={() => show(true)}
          onMouseLeave={() => hide()}
          className={`kl-fade-in pointer-events-auto absolute left-1/2 z-50 w-max -translate-x-1/2 rounded-[6px] bg-tooltip-bg px-2.5 py-1.5 text-sm leading-normal text-tooltip-text shadow-popover ${
            below ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
          }`}
          style={{ maxWidth: '280px' }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
