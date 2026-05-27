'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';
import toast from 'react-hot-toast';

type Contact = {
  id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type ContactGroup = {
  id: string;
  name: string;
  description?: string;
  contacts: Contact[];
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

type Campaign = {
  id: string;
  name: string;
  message: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  scheduledAt?: string;
};

type CampaignsResponse = {
  data: Campaign[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

function getMinScheduleDateTime() {
  const date = new Date(Date.now() + 60 * 1000);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(date.getTime() - timezoneOffsetMs);

  return localDate.toISOString().slice(0, 16);
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const characterCount = message.length;
  const estimatedSegments = useMemo(() => {
    if (!message.length) return 0;
    return Math.ceil(message.length / 160);
  }, [message]);

  const totalSelected = selectedContacts.length + selectedGroups.length;
  const minScheduleDateTime = useMemo(() => getMinScheduleDateTime(), []);

  async function loadData() {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      setError('');

      const [campaignsResponse, contactsResponse, groupsResponse] =
        await Promise.all([
          apiFetch<CampaignsResponse>('/campaigns', undefined, token),
          apiFetch<ContactsResponse>('/contacts', undefined, token),
          apiFetch<ContactGroup[]>('/contact-groups', undefined, token),
        ]);

      setCampaigns(campaignsResponse.data);
      setContacts(contactsResponse.data);
      setGroups(groupsResponse);
    } catch (error) {
      console.error('Failed to load campaigns data', error);
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to load campaigns data',
      );
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function toggleContact(contactId: string) {
    setSelectedContacts((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId],
    );
  }

  function toggleGroup(groupId: string) {
    setSelectedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (
      !name.trim() ||
      !message.trim() ||
      (selectedContacts.length === 0 && selectedGroups.length === 0)
    ) {
      setError(
        'Campaign name, message, and at least one contact or group are required',
      );
      setSuccess('');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await apiFetch(
        '/campaigns',
        {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            message: message.trim(),
            contactIds: selectedContacts,
            groupIds: selectedGroups,
            scheduledAt: scheduledAt || undefined,
          }),
        },
        token,
      );

      setName('');
      setMessage('');
      setScheduledAt('');
      setSelectedContacts([]);
      setSelectedGroups([]);

      toast.success('Campaign created successfully');
      await loadData();
    } catch (error) {
      console.error('Failed to create campaign', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create campaign',
      );
      setSuccess('');
    } finally {
      setLoading(false);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'border-green-100 bg-green-50 text-green-700';
      case 'failed':
        return 'border-red-100 bg-red-50 text-red-700';
      case 'processing':
        return 'border-yellow-100 bg-yellow-50 text-yellow-700';
      case 'scheduled':
        return 'border-purple-100 bg-purple-50 text-purple-700';
      case 'draft':
        return 'border-gray-100 bg-gray-50 text-gray-600';
      default:
        return 'border-blue-100 bg-blue-50 text-blue-700';
    }
  }

  function formatStatus(status: string) {
    return status
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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
          <h2 className="text-2xl font-bold">Create Campaign</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Send a message to selected contacts, groups, or both.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className={ui.label}>Campaign Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                  placeholder="Campaign name"
                />
              </div>

              <div className="space-y-1.5">
                <label className={ui.label}>Schedule Time</label>
                <input
                  type="datetime-local"
                  min={minScheduleDateTime}
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                />
                <p className="text-xs leading-5 text-slate-400">
                  Leave empty to send immediately.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <label className={ui.label}>Message</label>
                <span className="text-xs text-slate-400">
                  {characterCount}/1600 · {estimatedSegments} segment
                  {estimatedSegments === 1 ? '' : 's'}
                </span>
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={`${ui.textarea} min-h-40 transition focus:ring-4 focus:ring-blue-100`}
                maxLength={1600}
                placeholder="Write your campaign SMS..."
              />
            </div>

            <div>
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-base font-semibold text-gray-900">
                  Select Contacts
                </h3>
                <span className="text-xs text-slate-400">
                  {selectedContacts.length} selected
                </span>
              </div>

              {contacts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
                  No contacts available. Create contacts first.
                </div>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  {contacts.map((contact) => {
                    const checked = selectedContacts.includes(contact.id);

                    return (
                      <label
                        key={contact.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                          checked
                            ? 'border-blue-200 bg-blue-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleContact(contact.id)}
                          className="mt-1 h-4 w-4 shrink-0"
                        />

                        <div className="min-w-0">
                          <p className="break-words font-medium text-gray-900">
                            {getContactName(contact)}
                          </p>
                          <p className="break-words text-sm text-gray-500">
                            {contact.phone}
                          </p>
                          {contact.email ? (
                            <p className="mt-1 break-words text-xs text-gray-400">
                              {contact.email}
                            </p>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-base font-semibold text-gray-900">
                  Select Groups
                </h3>
                <span className="text-xs text-slate-400">
                  {selectedGroups.length} selected
                </span>
              </div>

              {groups.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
                  No groups available. Create groups first.
                </div>
              ) : (
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  {groups.map((group) => {
                    const checked = selectedGroups.includes(group.id);

                    return (
                      <label
                        key={group.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                          checked
                            ? 'border-blue-200 bg-blue-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleGroup(group.id)}
                          className="mt-1 h-4 w-4 shrink-0"
                        />

                        <div className="min-w-0">
                          <p className="break-words font-medium text-gray-900">
                            {group.name}
                          </p>
                          <p className="break-words text-sm text-gray-500">
                            {group.contacts.length} contact
                            {group.contacts.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                {totalSelected} recipient source
                {totalSelected === 1 ? '' : 's'} selected
              </p>

              <button
                type="submit"
                disabled={loading}
                className={`${ui.primaryButton} w-full justify-center sm:w-auto`}
              >
                {loading ? 'Creating...' : 'Create Campaign'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
          <h2 className={ui.sectionTitle}>Campaigns</h2>
          <p className={ui.sectionSubtitle}>
            Track campaign status, recipients, and outcomes.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          {pageLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              Loading campaigns...
            </div>
          ) : campaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              No campaigns yet.
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-gray-900">
                        {campaign.name}
                      </p>

                      <p className="mt-1 line-clamp-3 break-words text-sm leading-6 text-gray-600">
                        {campaign.message}
                      </p>

                      {campaign.scheduledAt ? (
                        <p className="mt-2 break-words text-xs text-gray-500">
                          Scheduled for:{' '}
                          {new Date(campaign.scheduledAt).toLocaleString()}
                        </p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-500">
                        <span className="rounded-full bg-slate-100 px-3 py-1">
                          Total: {campaign.totalRecipients}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                          Sent: {campaign.sentCount}
                        </span>
                        <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">
                          Failed: {campaign.failedCount}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 lg:items-end">
                      <p className="text-xs text-gray-400">
                        {new Date(campaign.createdAt).toLocaleString()}
                      </p>

                      <span
                        className={`inline-flex h-7 w-fit items-center justify-center rounded-full border px-3 text-xs font-bold ${getStatusColor(
                          campaign.status,
                        )}`}
                      >
                        {formatStatus(campaign.status)}
                      </span>
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