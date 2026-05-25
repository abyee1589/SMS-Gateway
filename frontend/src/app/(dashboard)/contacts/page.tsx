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
    if (!token) return;

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
      setError('Failed to load contacts');
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadContacts();
  }, []);

  const handleCreateContact = async (
    e: React.SyntheticEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();

    const token = getToken();
    if (!token) return;

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
      toast.error('Failed to create contact');
      setSuccess('');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPageLoading(true);
    await loadContacts(search);
  };

  const handleCsvImport = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    const token = getToken();
    if (!token || !csvFile) return;

    setImportLoading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', csvFile);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'}/contacts/import`,
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
        throw new Error(text || 'Failed to import contacts');
      }

      const result = JSON.parse(text);

      setCsvFile(null);
      toast.success(
        `CSV import finished: ${result.imported} imported, ${result.skipped} skipped.`,
      );
      await loadContacts(search);
    } catch (error) {
      console.error('Failed to import contacts', error);
      toast.error('Failed to import contacts');
      setSuccess('');
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className={ui.page}>
      {error ? <div className={ui.alertError}>{error}</div> : null}
      {success ? <div className={ui.alertSuccess}>{success}</div> : null}

      <div className={ui.card}>
        <div className={ui.cardBody}>
          <h2 className={ui.sectionTitle}>Create Contact</h2>
          <p className={ui.sectionSubtitle}>
            Add individual contacts for direct messaging and campaigns.
          </p>

          <form
            onSubmit={handleCreateContact}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6"
          >
            <div className="space-y-1">
              <label className={ui.label}>Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={ui.input}
              />
            </div>

            <div className="space-y-1">
              <label className={ui.label}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={ui.input}
              />
            </div>

            <div className="space-y-1">
              <label className={ui.label}>First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={ui.input}
              />
            </div>

            <div className="space-y-1">
              <label className={ui.label}>Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={ui.input}
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className={ui.primaryButton}
              >
                {loading ? 'Creating...' : 'Create Contact'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className={ui.card}>
        <div className={ui.cardBody}>
          <h2 className={ui.sectionTitle}>Import Contacts CSV</h2>
          <p className={ui.sectionSubtitle}>
            Bulk import contacts using a CSV file with phone, firstName, lastName, and email columns.
          </p>

          <form onSubmit={handleCsvImport} className="space-y-4 mt-6">
            <div className="space-y-1">
              <label className={ui.label}>CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className={ui.input}
              />
            </div>

            <button
              type="submit"
              disabled={importLoading || !csvFile}
              className={ui.secondaryButton}
            >
              {importLoading ? 'Importing...' : 'Import CSV'}
            </button>
          </form>
        </div>
      </div>

      <div className={ui.card}>
        <div className={ui.cardBody}>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className={ui.sectionTitle}>Contacts</h2>
              <p className={ui.sectionSubtitle}>
                Search and manage your tenant contact list.
              </p>
            </div>

            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={ui.input}
              />
              <button type="submit" className={ui.secondaryButton}>
                Search
              </button>
            </form>
          </div>

          {pageLoading ? (
            <div className="text-gray-500 mt-6">Loading contacts...</div>
          ) : contacts.length === 0 ? (
            <div className="text-gray-500 mt-6">No contacts found.</div>
          ) : (
            <div className="space-y-3 mt-6">
              {contacts.map((contact) => (
                <div key={contact.id} className={ui.listItem}>
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {[contact.firstName, contact.lastName]
                          .filter(Boolean)
                          .join(' ') || 'Unnamed Contact'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {contact.phone}
                      </p>
                      {contact.email ? (
                        <p className="text-sm text-gray-500 mt-1">
                          {contact.email}
                        </p>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          contact.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {contact.isActive ? 'active' : 'inactive'}
                      </span>

                      <p className="text-xs text-gray-400 mt-3">
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