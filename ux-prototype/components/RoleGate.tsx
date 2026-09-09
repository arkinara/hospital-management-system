import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn } from './cn';

export type Role = 'admin' | 'doctor' | 'nurse' | 'receptionist';

export interface RoleGateProps {
  /** The current user's role. */
  role: Role;
  /** Allowed roles, or a predicate that receives the role. */
  allow: Role[] | ((role: Role) => boolean);
  /** Content rendered when authorized. */
  children: ReactNode;
  /** Optional custom fallback rendered when not authorized. */
  fallback?: ReactNode;
  /** Optional back action for the default fallback view. */
  onBack?: () => void;
  /** Additional classes on the fallback wrapper. */
  className?: string;
}

/**
 * Conditionally renders children based on the user's role, with a
 * not-authorized fallback otherwise.
 *
 * @param role - Current user role.
 * @param allow - Allowed roles list or predicate.
 * @param children - Authorized content.
 * @param fallback - Optional custom unauthorized view.
 * @param onBack - Optional back handler for the default fallback.
 * @param className - Additional fallback classes.
 * @example
 * <RoleGate role={role} allow={['admin']}><AdminPanel /></RoleGate>
 */
const RoleGate = ({ role, allow, children, fallback, onBack, className }: RoleGateProps) => {
  const allowed = typeof allow === 'function' ? allow(role) : allow.includes(role);

  if (allowed) return <>{children}</>;
  if (fallback != null) return <>{fallback}</>;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className,
      )}
    >
      <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-high text-rose-800">
        <Lock size={24} strokeWidth={2} />
      </span>
      <h3 className="text-lg font-medium text-foreground">Not authorized</h3>
      <p className="mt-1 max-w-sm text-sm text-foreground/70">
        You don't have permission to view this module.
      </p>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-surface-container-high hover:text-foreground"
        >
          Go back
        </button>
      )}
    </div>
  );
};

export default RoleGate;
