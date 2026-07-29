'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';
import toast from 'react-hot-toast';

type Contact = {
  id: string;
  tenantId: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ContactsResponse = {
  data: Contact[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type TokenPayload = {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  iat?: number;
  exp?: number;
};

type ActionPanel = 'create' | 'import' | null;

function decodeJwtPayload(token: string): TokenPayload | null {
  try {
    const payload = token.split('.')[1];

    if (!payload) return null;

    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decodedPayload = JSON.parse(atob(normalizedPayload)) as TokenPayload;

    return decodedPayload;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    const message = (error as { message?: unknown }).message;

    if (Array.isArray(message)) return message[0] ?? 'Request failed';
    if (typeof message === 'string') return message;
  }

  if (error instanceof Error) return error.message;

  return 'Request failed';
}

function formatNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0);

  if (Number.isNaN(numberValue)) return '0';

  return new Intl.NumberFormat('en-US').format(numberValue);
}

export default function ContactsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [search, setSearch] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [activePanel, setActivePanel] = useState<ActionPanel>(null);
  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentRole, setCurrentRole] = useState<string>('');

  const canImportCsv = useMemo(
    () => ['admin', 'super_admin'].includes(currentRole),
    [currentRole],
  );

  const activeContacts = useMemo(
    () => contacts.filter((contact) => contact.isActive).length,
    [contacts],
  );

  const inactiveContacts = useMemo(
    () => contacts.filter((contact) => !contact.isActive).length,
    [contacts],
  );

  async function loadContacts(searchValue = '') {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    const payload = decodeJwtPayload(token);
    setCurrentRole(payload?.role || '');

    try {
      setError('');

      const query = searchValue
        ? `?search=${encodeURIComponent(searchValue)}`
        : '';

      const response = await apiFetch<ContactsResponse>(
        `/contacts${query}`,
        undefined,
        token,
      );

      setContacts(response.data);
    } catch (error) {
      console.error('Failed to load contacts', error);
      setError(getErrorMessage(error));
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadContacts();
  }, []);

  function resetContactForm() {
    setPhone('');
    setFirstName('');
    setLastName('');
    setEmail('');
  }

  function resetCsvImport() {
    setCsvFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function togglePanel(panel: ActionPanel) {
    setActivePanel((currentPanel) => (currentPanel === panel ? null : panel));
    setError('');

    if (panel === 'create') {
      resetCsvImport();
    }

    if (panel === 'import') {
      resetContactForm();
    }
  }

  async function handleCreateContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!phone.trim()) {
      toast.error('Phone number is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await apiFetch(
        '/contacts',
        {
          method: 'POST',
          body: JSON.stringify({
            phone: phone.trim(),
            firstName: firstName.trim() || undefined,
            lastName: lastName.trim() || undefined,
            email: email.trim() || undefined,
          }),
        },
        token,
      );

      resetContactForm();
      setActivePanel(null);

      toast.success('Contact created successfully');
      await loadContacts(search);
    } catch (error) {
      console.error('Failed to create contact', error);
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPageLoading(true);
    await loadContacts(search);
  }

  async function handleCsvImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!canImportCsv) {
      toast.error('Only admins can import contacts from CSV');
      return;
    }

    if (!csvFile) {
      toast.error('Please choose a CSV file');
      return;
    }

    setImportLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', csvFile);

      const response = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'
        }/contacts/import`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      const text = await response.text();

      if (!response.ok) {
        let message = text || 'Failed to import contacts';

        try {
          const data = JSON.parse(text);

          if (Array.isArray(data.message)) {
            message = data.message.join(', ');
          } else if (typeof data.message === 'string') {
            message = data.message;
          } else if (typeof data.error === 'string') {
            message = data.error;
          }
        } catch {
          // keep text fallback
        }

        throw new Error(message);
      }

      const result = JSON.parse(text);

      resetCsvImport();
      setActivePanel(null);

      toast.success(
        `CSV import finished: ${formatNumber(result.imported)} imported, ${formatNumber(
          result.skipped,
        )} skipped.`,
      );

      await loadContacts(search);
    } catch (error) {
      console.error('Failed to import contacts', error);
      toast.error(getErrorMessage(error));
    } finally {
      setImportLoading(false);
    }
  }

  function getContactName(contact: Contact) {
    return (
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
      'Unnamed Contact'
    );
  }

  return (
    <div className={ui.page}>
      {error ? <div className={ui.alertError}>{error}</div> : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total Contacts" value={formatNumber(contacts.length)} />
        <StatCard label="Active" value={formatNumber(activeContacts)} />
        <StatCard label="Inactive" value={formatNumber(inactiveContacts)} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-5 text-white sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold">Contact Management</h2>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Create contacts individually or import company contacts in bulk
                using a CSV file.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => togglePanel('create')}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  activePanel === 'create'
                    ? 'bg-white text-slate-950'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {activePanel === 'create' ? 'Close Form' : 'New Contact'}
              </button>

              {canImportCsv ? (
                <button
                  type="button"
                  onClick={() => togglePanel('import')}
                  className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                    activePanel === 'import'
                      ? 'bg-white text-slate-950'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {activePanel === 'import' ? 'Close Import' : 'Import CSV'}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {activePanel === 'create' ? (
          <div className="border-b border-slate-100 p-4 sm:p-6">
            <form onSubmit={handleCreateContact} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Phone Number">
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                    placeholder="+2519XXXXXXXX or 09XXXXXXXX"
                  />
                </Field>

                <Field label="Email">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                    placeholder="contact@example.com"
                  />
                </Field>

                <Field label="First Name">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                    placeholder="First name"
                  />
                </Field>

                <Field label="Last Name">
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                    placeholder="Last name"
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={loading}
                  className={`${ui.primaryButton} w-full justify-center sm:w-auto`}
                >
                  {loading ? 'Creating...' : 'Create Contact'}
                </button>

                <button
                  type="button"
                  onClick={resetContactForm}
                  disabled={loading}
                  className={`${ui.secondaryButton} w-full justify-center sm:w-auto`}
                >
                  Clear
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {activePanel === 'import' && canImportCsv ? (
          <div className="border-b border-slate-100 p-4 sm:p-6">
            <form onSubmit={handleCsvImport} className="space-y-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Import Contacts CSV
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Upload a CSV file with phone, firstName, lastName, and email
                  columns.
                </p>
              </div>

              <Field label="CSV File">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  className={`${ui.input} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-700 hover:file:bg-slate-200`}
                />

                {csvFile ? (
                  <p className="mt-2 break-words text-xs text-slate-500">
                    Selected: {csvFile.name}
                  </p>
                ) : null}
              </Field>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={importLoading || !csvFile}
                  className={`${ui.primaryButton} w-full justify-center sm:w-auto`}
                >
                  {importLoading ? 'Importing...' : 'Import CSV'}
                </button>

                <button
                  type="button"
                  onClick={resetCsvImport}
                  disabled={importLoading}
                  className={`${ui.secondaryButton} w-full justify-center sm:w-auto`}
                >
                  Clear File
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {!activePanel ? (
          <div className="p-4 sm:p-6">
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
              Choose <span className="font-bold text-slate-700">New Contact</span>
              {canImportCsv ? (
                <>
                  {' '}
                  or <span className="font-bold text-slate-700">Import CSV</span>
                </>
              ) : null}{' '}
              to add contacts. Existing contacts are listed below.
            </div>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h2 className={ui.sectionTitle}>Contacts</h2>
              <p className={ui.sectionSubtitle}>
                {canImportCsv
                  ? 'Search and manage company contacts for this tenant.'
                  : 'Search and manage your personal contact list.'}
              </p>
            </div>

            <form
              onSubmit={handleSearch}
              className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"
            >
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${ui.input} min-w-0 sm:w-72`}
                placeholder="Search contacts..."
              />

              <button
                type="submit"
                className={`${ui.secondaryButton} w-full justify-center sm:w-auto`}
              >
                Search
              </button>

              {search ? (
                <button
                  type="button"
                  onClick={async () => {
                    setSearch('');
                    setPageLoading(true);
                    await loadContacts('');
                  }}
                  className={`${ui.secondaryButton} w-full justify-center sm:w-auto`}
                >
                  Clear
                </button>
              ) : null}
            </form>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {pageLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              Loading contacts...
            </div>
          ) : contacts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              No contacts found. Use the New Contact button above to create one.
            </div>
          ) : (
            <div className="max-h-[760px] space-y-3 overflow-y-auto pr-2">
              {contacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  name={getContactName(contact)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className={ui.label}>{label}</label>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string | number;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 break-words text-2xl font-black text-slate-950">
        {value}
      </p>
    </div>
  );
}

function ContactCard({ contact, name }: { contact: Contact; name: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="break-words font-semibold text-gray-900">{name}</p>

          <div className="mt-2 space-y-1">
            <p className="break-words text-sm text-gray-600">
              {contact.phone}
            </p>

            {contact.email ? (
              <p className="break-words text-sm text-gray-500">
                {contact.email}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          <span
            className={`inline-flex h-7 w-20 items-center justify-center rounded-full px-2.5 text-xs font-bold ${
              contact.isActive
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {contact.isActive ? 'Active' : 'Inactive'}
          </span>

          <p className="text-xs text-gray-400">
            {new Date(contact.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
