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
    roles: ['admin', 'user'],
    children: [
      {
        href: '/messages/new',
        label: 'New Message',
        roles: ['admin', 'user'],
      },
      {
        href: '/messages/inbound',
        label: 'Inbox',
        roles: ['admin', 'user'],
      },
      {
        href: '/messages/outbox',
        label: 'Outbox',
        roles: ['admin', 'user'],
      },
      {
        href: '/messages/scheduled',
        label: 'Scheduled',
        roles: ['admin', 'user'],
      },
      // {
      //   href: '/messages/failed',
      //   label: 'Failed',
      //   roles: ['admin', 'user'],
      // },
      // {
      //   href: '/messages/Dead-letter',
      //   label: 'dead-letter',
      //   roles: ['admin', 'user'],
      // },
    ],
  },
  {
    href: '/delivery-operations',
    label: 'Delivery Operations',
    roles: ['super_admin'],
    children: [
      {
        href: '/delivery-operations/outbound',
        label: 'Outbound Flow',
        roles: ['super_admin'],
      },
      {
        href: '/delivery-operations/delivered',
        label: 'Delivered',
        roles: ['super_admin'],
      },
      {
        href: '/delivery-operations/failed',
        label: 'Failed Deliveries',
        roles: ['super_admin'],
      },
      {
        href: '/delivery-operations/dead-letter',
        label: 'Dead Letter',
        roles: ['super_admin'],
      },
    ],
  },
  {
    href: '/contacts',
    label: 'Contacts',
    roles: ['admin', 'user'],
    children: [
      {
        href: '/contacts',
        label: 'All Contacts',
        roles: ['admin', 'user'],
      },
      {
        href: '/contacts/groups',
        label: 'Groups',
        roles: ['admin', 'user'],
      },
    ],
  },
  {
    href: '/campaigns',
    label: 'Campaigns',
    roles: ['admin', 'user'],
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

export function canAccess(role: string | undefined, roles: UserRole[]) {
  if (!role) return false;

  return roles.includes(role.toLowerCase() as UserRole);
}

function uniqueRoles(items: NavItem[]) {
  return Array.from(new Set(items.flatMap((item) => item.roles))) as UserRole[];
}

export function getAllowedRolesForPath(pathname: string): UserRole[] {
  const flatItems = navItems.flatMap((item) => [
    item,
    ...(item.children ?? []),
  ]);

  const exactMatches = flatItems.filter((nav) => pathname === nav.href);

  if (exactMatches.length > 0) {
    return uniqueRoles(exactMatches);
  }

  const sectionMatches = flatItems
    .filter((nav) => pathname.startsWith(`${nav.href}/`))
    .sort((a, b) => b.href.length - a.href.length);

  if (sectionMatches.length > 0) {
    const mostSpecificLength = sectionMatches[0].href.length;

    return uniqueRoles(
      sectionMatches.filter((item) => item.href.length === mostSpecificLength),
    );
  }

  return ['super_admin', 'admin', 'user'];
}