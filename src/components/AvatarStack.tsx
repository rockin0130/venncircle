import { cn } from "@/lib/utils";
import { AvatarMember, getAvatarPalette } from "@/lib/calendarAssignees";

interface AvatarStackProps {
  members: AvatarMember[];
  className?: string;
  size?: number;
}

const AvatarStack = ({ members, className, size = 15 }: AvatarStackProps) => {
  if (members.length === 0) return null;

  const fontSize = Math.max(7, Math.floor(size * 0.46));

  return (
    <div className={cn("flex items-center -space-x-1", className)}>
      {members.map((member) => {
        const palette = getAvatarPalette(member.colorIndex);

        return (
          <span
            key={member.id}
            className="inline-flex items-center justify-center rounded-full border font-bold leading-none shadow-sm"
            style={{
              width: size,
              height: size,
              fontSize,
              backgroundColor: palette.avatarBackground,
              color: palette.avatarText,
              borderColor: "hsl(var(--card))",
            }}
            title={member.initial}
          >
            {member.initial}
          </span>
        );
      })}
    </div>
  );
};

export default AvatarStack;