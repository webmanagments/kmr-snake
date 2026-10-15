// Small inline icons (no icon font or image downloads).
type P = {size?: number};

const svg = (size: number, children: React.ReactNode, fill = false) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Play = ({size = 20}: P) => svg(size, <path d="M7 4.5v15l12.5-7.5z" />, true);
export const Trophy = ({size = 20}: P) =>
  svg(
    size,
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 20h8" />
    </>,
  );
export const Palette = ({size = 20}: P) =>
  svg(
    size,
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.1-.5-1.3.4-2.4 1.8-2.4H18a3 3 0 0 0 3-3C21 7 17 3 12 3z" />
      <circle cx="7.5" cy="11" r="1.2" fill="currentColor" />
      <circle cx="10.5" cy="7" r="1.2" fill="currentColor" />
      <circle cx="15" cy="7.5" r="1.2" fill="currentColor" />
    </>,
  );
export const SoundOn = ({size = 20}: P) =>
  svg(
    size,
    <>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </>,
  );
export const SoundOff = ({size = 20}: P) =>
  svg(
    size,
    <>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M17 9.5l5 5M22 9.5l-5 5" />
    </>,
  );
export const Lock = ({size = 16}: P) =>
  svg(
    size,
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>,
  );
export const Check = ({size = 16}: P) => svg(size, <path d="M5 12.5l4.5 4.5L19 7.5" />);
export const Restart = ({size = 18}: P) =>
  svg(
    size,
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4.5h4.5" />
    </>,
  );
export const HomeIcon = ({size = 18}: P) =>
  svg(
    size,
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 9.5V20h12V9.5" />
    </>,
  );
export const Backspace = ({size = 22}: P) =>
  svg(
    size,
    <>
      <path d="M9 5h11v14H9l-6-7z" />
      <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
    </>,
  );
export const ShiftIcon = ({size = 22, filled = false}: P & {filled?: boolean}) => svg(size, <path d="M12 4l8 8h-4.5v7h-7v-7H4z" fill={filled ? 'currentColor' : 'none'} />);
export const Dice = ({size = 18}: P) =>
  svg(
    size,
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" />
      <circle cx="15" cy="15" r="1.2" fill="currentColor" />
      <circle cx="15" cy="9" r="1.2" fill="currentColor" />
      <circle cx="9" cy="15" r="1.2" fill="currentColor" />
    </>,
  );

export const LinkIcon = ({size = 18}: P) =>
  svg(
    size,
    <>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    </>,
  );

/** The coin used for prices and balances. */
export const Coin = ({size = 16}: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#ffc531" />
    <circle cx="12" cy="12" r="7" fill="none" stroke="#b7820a" strokeWidth="1.8" />
    <path d="M9.5 8.5v7M9.5 12l4.5-3.5M11 11l3.5 4.5" stroke="#7a5200" strokeWidth="2" strokeLinecap="round" fill="none" />
  </svg>
);

/** Mode emblems: a plain box, a box with open edges, a box with walls inside. */
export function ModeIcon({mode, size = 34}: {mode: 'classic' | 'portal' | 'maze'; size?: number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true" fill="none" strokeLinecap="round">
      {mode === 'portal' ? (
        <rect x="3" y="3" width="28" height="28" rx="5" stroke="currentColor" strokeWidth="2.4" strokeDasharray="5 4" />
      ) : (
        <rect x="3" y="3" width="28" height="28" rx="5" stroke="currentColor" strokeWidth="2.4" />
      )}
      {mode === 'maze' && <path d="M10 10h6M10 10v6M24 24h-6M24 24v-6" stroke="#7d63ff" strokeWidth="3.2" />}
      <path d="M9 22h7v-6h5" stroke="#39ff88" strokeWidth="3.4" strokeLinejoin="round" />
      <circle cx="25" cy="10" r="2.6" fill="#ff3b5c" />
    </svg>
  );
}
