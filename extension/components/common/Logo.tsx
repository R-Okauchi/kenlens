/**
 * ロゴ: 角丸スクエア (squircle) + ブランドグラデ + 白い虫眼鏡。
 * レンズ円の内側に引用符を想起させる 2 本線 (文献=テキストのメタファ)。
 */
export function Logo({ size = 48 }: { size?: number }) {
  const detailed = size >= 40;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="研レンズ / KenLens"
    >
      <defs>
        <linearGradient id="kl-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0D9488" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="10.5" fill="url(#kl-grad)" />
      <circle
        cx="21"
        cy="21"
        r="9.5"
        fill="none"
        stroke="#fff"
        strokeWidth={detailed ? 3 : 3.5}
      />
      {detailed && (
        <>
          <line x1="17" y1="18.5" x2="25" y2="18.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          <line x1="17" y1="23.5" x2="22.5" y2="23.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      <line
        x1="28.5"
        y1="28.5"
        x2="36.5"
        y2="36.5"
        stroke="#fff"
        strokeWidth={detailed ? 3.6 : 4}
        strokeLinecap="round"
      />
    </svg>
  );
}
