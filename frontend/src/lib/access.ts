export type UserRole = 'manager' | 'admin' | 'user';

export type NavItem = {
  href: string;
  label: string;
  roles: UserRole[];
  children?: NavItem[];
};

export const navItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    roles: ['manager', 'admin', 'user'],
  },

  {
    href: '/messages',
    label: 'Messages',
    roles: ['manager', 'admin', 'user'],
    children: [
      {
        href: '/messages/new',
        label: 'New',
        roles: ['manager', 'admin', 'user'],
      },
      {
        href: '/messages/sent',
        label: 'Sent',
        roles: ['manager', 'admin', 'user'],
      },
      {
        href: '/messages/failed',
        label: 'Failed',
        roles: ['manager', 'admin', 'user'],
      },
      {
        href: '/messages/scheduled',
        label: 'Scheduled',
        roles: ['manager', 'admin', 'user'],
      },
      {
        href: '/messages/cancelled',
        label: 'Cancelled',
        roles: ['manager', 'admin', 'user'],
      },
    ],
  },

  {
    href: '/contacts',
    label: 'Contacts',
    roles: ['manager', 'admin', 'user'],
  },

  {
    href: '/campaigns',
    label: 'Campaigns',
    roles: ['manager', 'admin', 'user'],
  },

  {
    href: '/contact-groups',
    label: 'Groups',
    roles: ['manager', 'admin', 'user'],
  },

  {
    href: '/users',
    label: 'Users',
    roles: ['manager'],
  },

  {
    href: '/audit-logs',
    label: 'Audit Logs',
    roles: ['manager', 'admin'],
  },
];

export function canAccess(
  role: string | undefined,
  roles: UserRole[],
) {
  if (!role) return false;

  return roles.includes(role.toLowerCase() as UserRole);
}

export function getAllowedRolesForPath(
  pathname: string,
): UserRole[] {
  const flatItems = navItems.flatMap((item) => [
    item,
    ...(item.children ?? []),
  ]);

  const item = flatItems.find(
    (nav) =>
      pathname === nav.href ||
      pathname.startsWith(`${nav.href}/`),
  );

  return item?.roles ?? ['manager', 'admin', 'user'];
}