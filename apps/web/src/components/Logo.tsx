export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0F6CBD" />
      <path
        d="M14 40c6-10 12-15 18-15s12 5 18 15"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M18 48h28" stroke="#9CCBF2" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="18" r="5" fill="#fff" />
    </svg>
  );
}
