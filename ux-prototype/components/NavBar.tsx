import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export interface NavBarProps {
  /** Visible label of the nav item. */
  label: string;
  /** Lucide icon component rendered at the start of the item. */
  icon: LucideIcon;
  /** Destination href. */
  href: string;
  /** Whether this item represents the current route. */
  active?: boolean;
  /** Optional badge count/text shown at the trailing edge. */
  badge?: string | number;
  /** When true, hides the label and shows the icon only. */
  collapsed?: boolean;
}

/**
 * A single sidebar navigation item used by the app shell.
 *
 * @param label - Visible label of the item.
 * @param icon - Lucide icon rendered before the label.
 * @param href - Destination link.
 * @param active - Highlights the item as the current route.
 * @param badge - Optional trailing badge value.
 * @param collapsed - Icon-only rendering when true.
 * @example
 * <NavBar label="Patients" icon={Users} href="/patients" active />
 */
const NavBar = ({
  label,
  icon: Icon,
  href,
  active = false,
  badge,
  collapsed = false,
}: NavBarProps) => {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'group flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-foreground/80 hover:bg-surface-container-highest',
        collapsed && 'justify-center',
      )}
    >
      <Icon size={20} strokeWidth={2} className="shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badge != null && (
        <span className="ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">
          {badge}
        </span>
      )}
    </a>
  );
};

export default NavBar;
