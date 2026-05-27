'use client';

import { useEffect, useState } from 'react';
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

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [search, setSearch] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadContacts(searchValue = '') {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

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
      setError(
        error instanceof Error ? error.message : 'Failed to load contacts',
      );
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadContacts();
  }, []);

  async function handleCreateContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!phone.trim()) {
      toast.error('Phone number is required');
      setSuccess('');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

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

      setPhone('');
      setFirstName('');
      setLastName('');
      setEmail('');

      toast.success('Contact created successfully');
      await loadContacts(search);
    } catch (error) {
      console.error('Failed to create contact', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create contact',
      );
      setSuccess('');
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

    if (!csvFile) {
      toast.error('Please choose a CSV file');
      return;
    }

    setImportLoading(true);
    setError('');
    setSuccess('');

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

      setCsvFile(null);
      toast.success(
        `CSV import finished: ${result.imported} imported, ${result.skipped} skipped.`,
      );
      await loadContacts(search);
    } catch (error) {
      console.error('Failed to import contacts', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to import contacts',
      );
      setSuccess('');
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
      {success ? <div className={ui.alertSuccess}>{success}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-5 text-white sm:px-6">
          <h2 className="text-2xl font-bold">Create Contact</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Add individual contacts for direct messaging and campaigns.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          <form
            onSubmit={handleCreateContact}
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <div className="space-y-1.5">
              <label className={ui.label}>Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                placeholder="+2519XXXXXXXX or 09XXXXXXXX"
              />
            </div>

            <div className="space-y-1.5">
              <label className={ui.label}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                placeholder="contact@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className={ui.label}>First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
              />
            </div>

            <div className="space-y-1.5">
              <label className={ui.label}>Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className={`${ui.primaryButton} w-full justify-center sm:w-auto`}
              >
                {loading ? 'Creating...' : 'Create Contact'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
          <h2 className={ui.sectionTitle}>Import Contacts CSV</h2>
          <p className={`${ui.sectionSubtitle} leading-6`}>
            Bulk import contacts using a CSV file with phone, firstName,
            lastName, and email columns.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          <form onSubmit={handleCsvImport} className="space-y-4">
            <div className="space-y-1.5">
              <label className={ui.label}>CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className={`${ui.input} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-700 hover:file:bg-slate-200`}
              />
              {csvFile ? (
                <p className="break-words text-xs text-slate-500">
                  Selected: {csvFile.name}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={importLoading || !csvFile}
              className={`${ui.secondaryButton} w-full justify-center sm:w-auto`}
            >
              {importLoading ? 'Importing...' : 'Import CSV'}
            </button>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h2 className={ui.sectionTitle}>Contacts</h2>
              <p className={ui.sectionSubtitle}>
                Search and manage your tenant contact list.
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
              No contacts found.
            </div>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-gray-900">
                        {getContactName(contact)}
                      </p>

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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}