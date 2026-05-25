'use client';

import { useEffect, useState } from 'react';
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

  async function loadData() {
    const token = getToken();
    if (!token) return;

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
      setError('Failed to load campaigns data');
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

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const token = getToken();
    if (!token) return;

    if (
      !name.trim() ||
      !message.trim() ||
      (selectedContacts.length === 0 && selectedGroups.length === 0)
    ) {
      setError('Campaign name, message, and at least one contact or group are required');
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
      toast.error('Failed to create campaign');
      setSuccess('');
    } finally {
      setLoading(false);
    }
  };

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'processing':
        return 'text-yellow-600';
      case 'scheduled':
        return 'text-purple-600';
      case 'draft':
        return 'text-gray-500';
      default:
        return 'text-blue-600';
    }
  }

  return (
    <div className={ui.page}>
      {error ? <div className={ui.alertError}>{error}</div> : null}
      {success ? <div className={ui.alertSuccess}>{success}</div> : null}

      <div className={ui.card}>
        <div className={ui.cardBody}>
          <h2 className={ui.sectionTitle}>Create Campaign</h2>
          <p className={ui.sectionSubtitle}>
            Send a message to selected contacts, groups, or both.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={ui.label}>Campaign Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={ui.input}
                />
              </div>

              <div className="space-y-1">
                <label className={ui.label}>Schedule Time</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className={ui.input}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className={ui.label}>Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={ui.textarea}
              />
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                Select Contacts
              </h3>

              {contacts.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No contacts available. Create contacts first.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-gray-50">
                  {contacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-3 cursor-pointer bg-white"
                    >
                      <input
                        type="checkbox"
                        checked={selectedContacts.includes(contact.id)}
                        onChange={() => toggleContact(contact.id)}
                      />
                      <div>
                        <p className="font-medium text-gray-900">
                          {[contact.firstName, contact.lastName]
                            .filter(Boolean)
                            .join(' ') || 'Unnamed Contact'}
                        </p>
                        <p className="text-sm text-gray-500">{contact.phone}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                Select Groups
              </h3>

              {groups.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No groups available. Create groups first.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-gray-50">
                  {groups.map((group) => (
                    <label
                      key={group.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-3 cursor-pointer bg-white"
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroups.includes(group.id)}
                        onChange={() => toggleGroup(group.id)}
                      />
                      <div>
                        <p className="font-medium text-gray-900">{group.name}</p>
                        <p className="text-sm text-gray-500">
                          {group.contacts.length} contact
                          {group.contacts.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className={ui.primaryButton}
            >
              {loading ? 'Creating...' : 'Create Campaign'}
            </button>
          </form>
        </div>
      </div>

      <div className={ui.card}>
        <div className={ui.cardBody}>
          <h2 className={ui.sectionTitle}>Campaigns</h2>
          <p className={ui.sectionSubtitle}>
            Track campaign status, recipients, and outcomes.
          </p>

          {pageLoading ? (
            <div className="text-gray-500 mt-6">Loading campaigns...</div>
          ) : campaigns.length === 0 ? (
            <div className="text-gray-500 mt-6">No campaigns yet.</div>
          ) : (
            <div className="space-y-3 mt-6">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className={ui.listItem}>
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">
                        {campaign.name}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {campaign.message}
                      </p>

                      {campaign.scheduledAt ? (
                        <p className="text-xs text-gray-500 mt-2">
                          Scheduled for:{' '}
                          {new Date(campaign.scheduledAt).toLocaleString()}
                        </p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
                        <span>Total: {campaign.totalRecipients}</span>
                        <span>Sent: {campaign.sentCount}</span>
                        <span>Failed: {campaign.failedCount}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-gray-400">
                        {new Date(campaign.createdAt).toLocaleString()}
                      </p>
                      <p
                        className={`text-xs mt-2 uppercase font-semibold ${getStatusColor(
                          campaign.status,
                        )}`}
                      >
                        {campaign.status}
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