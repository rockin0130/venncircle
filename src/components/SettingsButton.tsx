import { Settings } from "lucide-react";

interface SettingsButtonProps {
  onClick: () => void;
  className?: string;
  size?: number;
}

const SettingsButton = ({ onClick, className = "", size = 18 }: SettingsButtonProps) => (
  <button
    onClick={onClick}
    className={`w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors ${className}`}
    aria-label="Settings"
  >
    <Settings size={size} />
  </button>
);

export default SettingsButton;
