'use client';

import Link from 'next/link';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getToken, removeToken } from '@/lib/auth';
import { getAllowedRolesForPath, canAccess, navItems } from '@/lib/access';
import {
  IconAddressBook,
  IconBellRinging,
  IconClipboardList,
  IconDashboard,
  IconMessage2,
  IconSpeakerphone,
  IconUsers,
  IconUsersGroup,
} from '@tabler/icons-react';

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};
type SidebarIcon = ComponentType<{
  size?: number;
  stroke?: number;
  className?: string;
}>;

const sidebarIcons: Record<string, SidebarIcon> = {
  '/': IconDashboard,
  '/dashboard': IconDashboard,
  '/messages': IconMessage2,
  '/contacts': IconAddressBook,
  '/campaigns': IconSpeakerphone,
  '/contact-groups': IconUsersGroup,
  '/users': IconUsers,
  '/audit-logs': IconClipboardList,
};

function getSidebarIcon(href: string) {
  return sidebarIcons[href] ?? IconBellRinging;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const mainRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  

  useEffect(() => {
    async function checkAuth() {
      const token = getToken();

      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const user = await apiFetch<CurrentUser>('/auth/me', undefined, token);

        setCurrentUser({
          ...user,
          role: user.role.toLowerCase(),
        });
      } catch {
        removeToken();
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [router]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!profileRef.current) return;

      if (!profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileOpen]);

  useEffect(() => {
    const activeParent = navItems.find((item) => {
      const hasChildren = item.children?.length;

      if (!hasChildren) return false;

      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    });

    if (!activeParent) {
      setOpenMenus({});
      return;
    }

    setOpenMenus({
      [activeParent.href]: true,
    });
  }, [pathname]);

  const allowedRoles = getAllowedRolesForPath(pathname);
  const hasPageAccess = canAccess(currentUser?.role, allowedRoles);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }

    const id = requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
      }
    });

    return () => cancelAnimationFrame(id);
  }, [pathname]);

  function resetScroll() {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }

  function handleLogout() {
    removeToken();
    router.push('/login');
  }

  function handleParentMenuClick(href: string) {
    resetScroll();

    const isOpen = openMenus[href];
    const isInCurrentSection =
      pathname === href || pathname.startsWith(`${href}/`);

    if (isOpen) {
      setOpenMenus({});
      return;
    }

    setOpenMenus({
      [href]: true,
    });

    if (!isInCurrentSection) {
      router.push(href);
    }
  }

  function getInitials(email?: string) {
    if (!email) return 'U';
    return email.charAt(0).toUpperCase();
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside
        className={`hidden border-r border-slate-800 bg-slate-950 text-white transition-all duration-300 md:flex md:flex-col ${
          sidebarOpen ? 'md:w-72' : 'md:w-20'
        }`}
      >
        <div className="border-b border-slate-800 px-4 py-5">
          <div
            className={`flex items-center ${
              sidebarOpen ? 'justify-between gap-3' : 'justify-center'
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm">
                Z
              </div>

              {sidebarOpen ? (
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold tracking-tight text-blue-400">
                    Zergaw SMS Gateway
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    Messaging Operations
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-2 overflow-hidden px-4 py-5">
          {navItems
            .filter((item) => canAccess(currentUser?.role, item.roles))
            .map((item) => {
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

              const visibleChildren = item.children?.filter((child) =>
                canAccess(currentUser?.role, child.roles),
              );

              const hasChildren = !!visibleChildren?.length;
              const menuOpen = openMenus[item.href] === true;
              const Icon = getSidebarIcon(item.href);

              return (
                <div key={item.href} className="space-y-1">
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => handleParentMenuClick(item.href)}
                      title={!sidebarOpen ? item.label : undefined}
                      className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                        active
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      } ${!sidebarOpen ? 'justify-center px-0' : ''}`}
                    >
                      {sidebarOpen ? (
  <>
    <span className="flex min-w-0 items-center gap-3">
      <Icon size={18} stroke={2} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </span>

    <span
      className={`text-xs transition-transform ${
        menuOpen ? 'rotate-90' : ''
      }`}
    >
      ›
    </span>
  </>
) : (
  <Icon size={21} stroke={2} className="shrink-0" />
)}
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      scroll={false}
                      title={!sidebarOpen ? item.label : undefined}
                      onClick={() => {
                        resetScroll();
                        setOpenMenus({});
                      }}
                      className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${
                        active
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      } ${!sidebarOpen ? 'px-0 text-center' : ''}`}
                    >
                      {sidebarOpen ? (
  <span className="flex min-w-0 items-center gap-3">
    <Icon size={18} stroke={2} className="shrink-0" />
    <span className="truncate">{item.label}</span>
  </span>
) : (
  <Icon size={21} stroke={2} className="mx-auto shrink-0" />
)}
                    </Link>
                  )}

                  {hasChildren && sidebarOpen ? (
                    <div
                      className={`ml-4 overflow-hidden border-l border-slate-800 pl-3 transition-all duration-300 ease-in-out ${
                        menuOpen
                          ? 'mt-1 max-h-52 opacity-100'
                          : 'max-h-0 opacity-0'
                      }`}
                    >
                      {visibleChildren.map((child) => {
                        const childActive = pathname === child.href;

                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            scroll={false}
                            onClick={resetScroll}
                            className={`block rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                              childActive
                                ? 'bg-slate-800 text-blue-300'
                                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
        </nav>

        <div className="border-t border-slate-800 px-4 py-4">
          {sidebarOpen ? (
            <div className="rounded-xl bg-slate-900 px-4 py-3">
              <p className="truncate text-sm font-medium text-white">
                {currentUser?.email ?? 'User'}
              </p>
              <p className="mt-1 text-xs capitalize text-slate-400">
                {currentUser?.role ?? 'user'}
              </p>
            </div>
          ) : (
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
              {getInitials(currentUser?.email)}
            </div>
          )}
        </div>
      </aside>

      <main ref={mainRef} className="h-screen min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 md:inline-flex"
                aria-label="Toggle sidebar"
              >
                ☰
              </button>

              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white md:hidden">
                  Z
                </div>

                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-bold text-gray-900">
                    NexusMsg Dashboard
                  </h1>
                  <p className="mt-1 truncate text-sm text-gray-500">
                    Manage campaigns, contacts, delivery, and users.
                  </p>
                </div>
              </div>
            </div>

            <div ref={profileRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setProfileOpen((current) => !current)}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                  {getInitials(currentUser?.email)}
                </span>

                <span className="hidden max-w-40 truncate lg:block">
                  {currentUser?.email ?? 'User'}
                </span>

                <span className="text-xs text-slate-400">▾</span>
              </button>

              {profileOpen ? (
                <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {currentUser?.email ?? 'User'}
                    </p>
                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {currentUser?.role ?? 'user'}
                    </p>
                  </div>

                  <button
  type="button"
  onClick={() => {
    setProfileOpen(false);
    handleLogout();
  }}
  className="block w-full px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
>
  Logout
</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div key={pathname} className="min-h-full p-6">
          {loading ? (
            <div className="text-gray-500">Loading...</div>
          ) : hasPageAccess ? (
            children
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              You do not have access to this page.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}