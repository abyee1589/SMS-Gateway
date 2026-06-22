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
    href: '/billing',
    label: 'Billing',
    roles: ['super_admin', 'admin'],
  },

  {
    href: '/subscription-plans',
    label: 'Plans',
    roles: ['super_admin'],
  },

  {
    href: '/tenants',
    label: 'Companies',
    roles: ['super_admin'],
  },

  {
    href: '/messages',
    label: 'Messages',
    roles: ['super_admin', 'admin', 'user'],
    children: [
      {
        href: '/messages/new',
        label: 'New Message',
        roles: ['super_admin', 'admin', 'user'],
      },
      {
        href: '/messages/outbound',
        label: 'Outbound',
        roles: ['super_admin', 'admin', 'user'],
      },
      {
        href: '/messages/scheduled',
        label: 'Scheduled',
        roles: ['super_admin', 'admin', 'user'],
      },
    ],
  },

  {
    href: '/contacts',
    label: 'Contacts',
    roles: ['super_admin', 'admin', 'user'],
    children: [
      {
        href: '/contacts',
        label: 'All Contacts',
        roles: ['super_admin', 'admin', 'user'],
      },
      {
        href: '/contacts/groups',
        label: 'Groups',
        roles: ['super_admin', 'admin', 'user'],
      },
    ],
  },

  {
    href: '/campaigns',
    label: 'Campaigns',
    roles: ['super_admin', 'admin', 'user'],
  },

  {
    href: '/users',
    label: 'Users',
    roles: ['super_admin', 'admin'],
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

export function getAllowedRolesForPath(pathname: string): UserRole[] {
  const flatItems = navItems.flatMap((item) => [
    ...(item.children ?? []),
    item,
  ]);

  const exactMatch = flatItems.find((nav) => pathname === nav.href);

  if (exactMatch) {
    return exactMatch.roles;
  }

  const sectionMatch = flatItems.find((nav) =>
    pathname.startsWith(`${nav.href}/`),
  );

  return sectionMatch?.roles ?? ['super_admin', 'admin', 'user'];
}