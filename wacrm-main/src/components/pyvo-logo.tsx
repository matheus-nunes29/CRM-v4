export function PyvoLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 220 56"
      aria-label="PYVO"
      className={className}
    >
      <polygon points="28,3 53,28 28,53 3,28" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <polygon points="28,11 45,28 28,45 11,28" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <text x="28" y="37" textAnchor="middle" fill="currentColor" fontFamily="Italiana, serif" fontSize="28">Y</text>
      <text x="70" y="37" fill="currentColor" fontFamily="Italiana, serif" fontSize="30" letterSpacing="6">PYVO</text>
    </svg>
  );
}
