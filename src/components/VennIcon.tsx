const VennIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="9.5" cy="12" r="6" stroke="currentColor" strokeWidth="2" fill="none" />
    <circle cx="14.5" cy="12" r="6" stroke="currentColor" strokeWidth="2" fill="none" />
  </svg>
);

export default VennIcon;
