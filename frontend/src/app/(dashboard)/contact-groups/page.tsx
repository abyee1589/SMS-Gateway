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
  tenantId: string;
  name: string;
  description?: string;
  contacts: Contact[];
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

export default function ContactGroupsPage() {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadData() {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      setError('');

      const [groupsResponse, contactsResponse] = await Promise.all([
        apiFetch<ContactGroup[]>('/contact-groups', undefined, token),
        apiFetch<ContactsResponse>('/contacts', undefined, token),
      ]);

      setGroups(groupsResponse);
      setContacts(contactsResponse.data);
    } catch (error) {
      console.error('Failed to load contact groups data', error);
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to load contact groups data',
      );
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreateGroup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!name.trim()) {
      setError('Group name is required');
      setSuccess('');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await apiFetch(
        '/contact-groups',
        {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
          }),
        },
        token,
      );

      setName('');
      setDescription('');
      toast.success('Group created successfully');
      await loadData();
    } catch (error) {
      console.error('Failed to create group', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create group',
      );
      setSuccess('');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMembers(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!selectedGroupId || selectedContactIds.length === 0) {
      toast.error('Please choose a group and at least one contact');
      setSuccess('');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await apiFetch(
        `/contact-groups/${selectedGroupId}/members`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            contactIds: selectedContactIds,
          }),
        },
        token,
      );

      setSelectedContactIds([]);
      toast.success('Contacts added to group successfully');
      await loadData();
    } catch (error) {
      console.error('Failed to add members', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to add contacts to group',
      );
      setSuccess('');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveMember(groupId: string, contactId: string) {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    setError('');
    setSuccess('');

    try {
      await apiFetch(
        `/contact-groups/${groupId}/members/remove`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            contactIds: [contactId],
          }),
        },
        token,
      );

      toast.success('Contact removed from group');
      await loadData();
    } catch (error) {
      console.error('Failed to remove member', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to remove contact from group',
      );
      setSuccess('');
    }
  }

  function toggleContact(contactId: string) {
    setSelectedContactIds((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId],
    );
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
          <h2 className="text-2xl font-bold">Create Contact Group</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Organize contacts into reusable segments for campaigns.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          <form
            onSubmit={handleCreateGroup}
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <div className="space-y-1.5">
              <label className={ui.label}>Group Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                placeholder="Customers, Leads, Staff..."
              />
            </div>

            <div className="space-y-1.5">
              <label className={ui.label}>Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                placeholder="Optional description"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className={`${ui.primaryButton} w-full justify-center sm:w-auto`}
              >
                {loading ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
          <h2 className={ui.sectionTitle}>Add Contacts to Group</h2>
          <p className={ui.sectionSubtitle}>
            Select a group and add one or more contacts to it.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          <form onSubmit={handleAddMembers} className="space-y-6">
            <div className="space-y-1.5">
              <label className={ui.label}>Choose Group</label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className={`${ui.select} transition focus:ring-4 focus:ring-blue-100`}
              >
                <option value="">Select a group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`${ui.label} mb-3 block`}>
                Select Contacts
              </label>

              {contacts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
                  No contacts available.
                </div>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  {contacts.map((contact) => {
                    const checked = selectedContactIds.includes(contact.id);

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

            <button
              type="submit"
              disabled={loading}
              className={`${ui.secondaryButton} w-full justify-center sm:w-auto`}
            >
              {loading ? 'Saving...' : 'Add Contacts'}
            </button>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
          <h2 className={ui.sectionTitle}>Contact Groups</h2>
          <p className={ui.sectionSubtitle}>
            View group membership and remove contacts when needed.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          {pageLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              Loading groups...
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              No groups yet.
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
                >
                  <div className="mb-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-gray-900">
                          {group.name}
                        </p>

                        {group.description ? (
                          <p className="mt-1 break-words text-sm leading-6 text-gray-500">
                            {group.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-2 md:items-end">
                        <span className="inline-flex h-7 w-fit items-center justify-center rounded-full bg-blue-100 px-2.5 text-xs font-bold text-blue-700">
                          {group.contacts.length} member
                          {group.contacts.length === 1 ? '' : 's'}
                        </span>
                        <p className="text-xs text-gray-400">
                          Created:{' '}
                          {new Date(group.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {group.contacts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-6 text-center text-sm text-slate-500">
                      No contacts in this group.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {group.contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 md:flex-row md:items-center md:justify-between"
                        >
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

                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveMember(group.id, contact.id)
                            }
                            className={`${ui.dangerButton} w-full justify-center md:w-auto`}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}