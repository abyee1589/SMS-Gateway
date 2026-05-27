export type UserRole = 'super_admin' | 'admin' | 'user';

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
    roles: ['super_admin', 'admin', 'user'],
  },

  {
    href: '/messages',
    label: 'Messages',
    roles: ['super_admin', 'admin', 'user'],
    children: [
      {
        href: '/messages/new',
        label: 'New',
        roles: ['super_admin', 'admin', 'user'],
      },
      {
        href: '/messages/sent',
        label: 'Sent',
        roles: ['super_admin', 'admin', 'user'],
      },
      {
        href: '/messages/failed',
        label: 'Failed',
        roles: ['super_admin', 'admin', 'user'],
      },
      {
        href: '/messages/scheduled',
        label: 'Scheduled',
        roles: ['super_admin', 'admin', 'user'],
      },
      {
        href: '/messages/cancelled',
        label: 'Cancelled',
        roles: ['super_admin', 'admin', 'user'],
      },
    ],
  },

  {
    href: '/contacts',
    label: 'Contacts',
    roles: ['super_admin', 'admin', 'user'],
  },

  {
    href: '/campaigns',
    label: 'Campaigns',
    roles: ['super_admin', 'admin', 'user'],
  },

  {
    href: '/contact-groups',
    label: 'Groups',
    roles: ['super_admin', 'admin', 'user'],
  },

  {
    href: '/users',
    label: 'Users',
    roles: ['super_admin'],
  },

  {
    href: '/audit-logs',
    label: 'Audit Logs',
    roles: ['super_admin', 'admin'],
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

  return item?.roles ?? ['super_admin', 'admin', 'user'];
}