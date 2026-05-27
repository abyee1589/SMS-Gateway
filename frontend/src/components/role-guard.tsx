'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type UserRole = 'super_admin' | 'admin' | 'user';

type RoleGuardProps = {
  currentUserRole?: string;
  allowedRoles: UserRole[];
  children: React.ReactNode;
};

export default function RoleGuard({
  currentUserRole,
  allowedRoles,
  children,
}: RoleGuardProps) {
  const router = useRouter();

  const normalizedRole = currentUserRole?.toLowerCase() as UserRole | undefined;
  const hasAccess = normalizedRole ? allowedRoles.includes(normalizedRole) : false;

  useEffect(() => {
    if (!currentUserRole) return;

    if (!hasAccess) {
      router.push('/dashboard');
    }
  }, [currentUserRole, hasAccess, router]);

  if (!currentUserRole) {
    return null;
  }

  if (!hasAccess) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
        You do not have access to this page.
      </div>
    );
  }

  return <>{children}</>;
}