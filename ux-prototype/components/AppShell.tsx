import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  FileText,
  Receipt,
  Shield,
  UserCog,
  Building2,
  LayoutGrid,
  KeySquare,
  BarChart3,
  Menu,
  X,
  Search,
  Moon,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import NavBar from './NavBar';
import { cn } from './cn';

export type Role = 'admin' | 'doctor' | 'nurse' | 'receptionist';

export interface AppShellUser {
  /** Display name. */
  name: string;
  /** Role label shown under the name. */
  role: string;
  /** Optional avatar image URL. */
  avatarUrl?: string;
}

export interface AppShellProps {
  /** Current user's role, drives nav filtering. */
  role: Role;
  /** Current route path for active-state matching. */
  currentPath: string;
  /** The signed-in user. */
  user: AppShellUser;
  /** Page content. */
  children: ReactNode;
}

interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
}

const PRIMARY_NAV: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Patients', icon: Users, href: '/patients' },
  { label: 'Appointments', icon: CalendarDays, href: '/appointments' },
  { label: 'Records', icon: FileText, href: '/records' },
  { label: 'Billing', icon: Receipt, href: '/billing' },
];

const ADMIN_SUBNAV: NavItem[] = [
  { label: 'Users', icon: UserCog, href: '/admin/users' },
  { label: 'Departments', icon: Building2, href: '/admin/departments' },
  { label: 'Widget Library', icon: LayoutGrid, href: '/admin/widgets' },
  { label: 'Permissions', icon: KeySquare, href: '/admin/permissions' },
  { label: 'Reports', icon: BarChart3, href: '/admin/reports' },
];

const ROLE_NAV: Record<Role, string[]> = {
  admin: ['Dashboard', 'Patients', 'Appointments', 'Records', 'Billing'],
  doctor: ['Dashboard', 'Patients', 'Appointments', 'Records'],
  nurse: ['Dashboard', 'Patients', 'Records'],
  receptionist: ['Dashboard', 'Patients', 'Appointments', 'Billing'],
};

/**
 * The application shell: role-filtered sidebar, sticky header, responsive
 * main region and mobile bottom navigation.
 *
 * @param role - Current user role, filters the navigation.
 * @param currentPath - Active route path.
 * @param user - The signed-in user.
 * @param children - Page content rendered in the main region.
 * @example
 * <AppShell role="doctor" currentPath="/patients" user={user}><Page /></AppShell>
 */
const AppShell = ({ role, currentPath, user, children }: AppShellProps) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const allowed = ROLE_NAV[role];
  const navItems = PRIMARY_NAV.filter((n) => allowed.includes(n.label));
  const showAdmin = role === 'admin';

  const isActive = (href: string) => currentPath === href || currentPath.startsWith(`${href}/`);
  const activeItem = [...PRIMARY_NAV, ...ADMIN_SUBNAV].find((n) => isActive(n.href));
  const title = activeItem?.label ?? 'Dashboard';

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const SidebarContent = () => (
    <>
      <div className="flex h-16 items-center gap-2 px-4">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Shield size={20} strokeWidth={2} />
        </span>
        <span className="text-base font-semibold text-foreground">MediCare</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {navItems.map((item) => (
          <NavBar
            key={item.href}
            label={item.label}
            icon={item.icon}
            href={item.href}
            active={isActive(item.href)}
          />
        ))}
        {showAdmin && (
          <div className="pt-2">
            <p className="flex items-center gap-2 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <Shield size={20} strokeWidth={2} className="h-4 w-4" />
              Admin
            </p>
            {ADMIN_SUBNAV.map((item) => (
              <NavBar
                key={item.href}
                label={item.label}
                icon={item.icon}
                href={item.href}
                active={isActive(item.href)}
              />
            ))}
          </div>
        )}
      </nav>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-outline/10 bg-surface-container-high lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface-container-high shadow-lg">
            <div className="flex justify-end p-2">
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground/70 transition-colors duration-200 hover:bg-surface-container-highest"
              >
                <X size={24} strokeWidth={2} />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-outline/10 bg-surface-container-high px-4 sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 transition-colors duration-200 hover:bg-surface-container-highest lg:hidden"
          >
            <Menu size={24} strokeWidth={2} />
          </button>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <div className="flex-1" />
          <button
            type="button"
            aria-label="Search"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 transition-colors duration-200 hover:bg-surface-container-highest"
          >
            <Search size={20} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Toggle dark mode"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 transition-colors duration-200 hover:bg-surface-container-highest"
          >
            <Moon size={20} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="flex min-h-[44px] items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors duration-200 hover:bg-surface-container-highest"
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {initials}
              </span>
            )}
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight text-foreground">
                {user.name}
              </span>
              <span className="block text-xs leading-tight text-foreground/70">{user.role}</span>
            </span>
            <ChevronDown size={20} strokeWidth={2} className="hidden text-foreground/70 sm:block" />
          </button>
        </header>

        {/* Main */}
        <main className="flex-1 p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-outline/10 bg-surface-container-high lg:hidden">
          {navItems.slice(0, 5).map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors duration-200',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground/70 hover:bg-surface-container-highest',
                )}
              >
                <Icon size={20} strokeWidth={2} />
                {item.label}
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default AppShell;
