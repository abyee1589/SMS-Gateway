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

  useEffect(() => {
    if (!currentUserRole) return;

    if (!allowedRoles.includes(currentUserRole as UserRole)) {
      router.push('/');
    }
  }, [currentUserRole, allowedRoles, router]);

  if (!currentUserRole) {
    return null;
  }

  if (!allowedRoles.includes(currentUserRole as UserRole)) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
        You do not have access to this page.
      </div>
    );
  }

  return <>{children}</>;
}