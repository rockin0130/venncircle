import { Menu } from "lucide-react";

interface DrawerMenuButtonProps {
  onClick: () => void;
}

const DrawerMenuButton = ({ onClick }: DrawerMenuButtonProps) => (
  <button
    onClick={onClick}
    className="fixed top-3 left-3 z-50 w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
    aria-label="Open menu"
  >
    <Menu size={20} />
  </button>
);

export default DrawerMenuButton;
