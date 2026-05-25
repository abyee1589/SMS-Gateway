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
    if (!token) return;

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
      setError('Failed to load contact groups data');
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateGroup = async (
    e: React.SyntheticEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();

    const token = getToken();
    if (!token) return;

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
      toast.error('Failed to create group');
      setSuccess('');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMembers = async (
    e: React.SyntheticEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();

    const token = getToken();
    if (!token) return;

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
      toast.error('Failed to add contacts to group');
      setSuccess('');
    } finally {
      setLoading(false);
    }
  };

  async function handleRemoveMember(groupId: string, contactId: string) {
    const token = getToken();
    if (!token) return;

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
      toast.error('Failed to remove contact from group');
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

  return (
    <div className={ui.page}>
      {error ? <div className={ui.alertError}>{error}</div> : null}
      {success ? <div className={ui.alertSuccess}>{success}</div> : null}

      <div className={ui.card}>
        <div className={ui.cardBody}>
          <h2 className={ui.sectionTitle}>Create Contact Group</h2>
          <p className={ui.sectionSubtitle}>
            Organize contacts into reusable segments for campaigns.
          </p>

          <form
            onSubmit={handleCreateGroup}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6"
          >
            <div className="space-y-1">
              <label className={ui.label}>Group Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={ui.input}
              />
            </div>

            <div className="space-y-1">
              <label className={ui.label}>Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={ui.input}
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className={ui.primaryButton}
              >
                {loading ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className={ui.card}>
        <div className={ui.cardBody}>
          <h2 className={ui.sectionTitle}>Add Contacts to Group</h2>
          <p className={ui.sectionSubtitle}>
            Select a group and add one or more contacts to it.
          </p>

          <form onSubmit={handleAddMembers} className="space-y-6 mt-6">
            <div className="space-y-1">
              <label className={ui.label}>Choose Group</label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className={ui.select}
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
              <label className={`${ui.label} block mb-3`}>Select Contacts</label>

              {contacts.length === 0 ? (
                <div className="text-sm text-gray-500">No contacts available.</div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-gray-50">
                  {contacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-3 cursor-pointer bg-white"
                    >
                      <input
                        type="checkbox"
                        checked={selectedContactIds.includes(contact.id)}
                        onChange={() => toggleContact(contact.id)}
                      />
                      <div>
                        <p className="font-medium text-gray-900">
                          {[contact.firstName, contact.lastName]
                            .filter(Boolean)
                            .join(' ') || 'Unnamed Contact'}
                        </p>
                        <p className="text-sm text-gray-500">{contact.phone}</p>
                        {contact.email ? (
                          <p className="text-xs text-gray-400 mt-1">
                            {contact.email}
                          </p>
                        ) : null}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className={ui.secondaryButton}
            >
              {loading ? 'Saving...' : 'Add Contacts'}
            </button>
          </form>
        </div>
      </div>

      <div className={ui.card}>
        <div className={ui.cardBody}>
          <h2 className={ui.sectionTitle}>Contact Groups</h2>
          <p className={ui.sectionSubtitle}>
            View group membership and remove contacts when needed.
          </p>

          {pageLoading ? (
            <div className="text-gray-500 mt-6">Loading groups...</div>
          ) : groups.length === 0 ? (
            <div className="text-gray-500 mt-6">No groups yet.</div>
          ) : (
            <div className="space-y-4 mt-6">
              {groups.map((group) => (
                <div key={group.id} className={ui.listItem}>
                  <div className="mb-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{group.name}</p>
                        {group.description ? (
                          <p className="text-sm text-gray-500 mt-1">
                            {group.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="text-right">
                        <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-blue-100 text-blue-700">
                          {group.contacts.length} member
                          {group.contacts.length === 1 ? '' : 's'}
                        </span>
                        <p className="text-xs text-gray-400 mt-2">
                          Created: {new Date(group.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {group.contacts.length === 0 ? (
                    <div className="text-sm text-gray-500">
                      No contacts in this group.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {group.contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-gray-200 px-3 py-3 bg-white"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {[contact.firstName, contact.lastName]
                                .filter(Boolean)
                                .join(' ') || 'Unnamed Contact'}
                            </p>
                            <p className="text-sm text-gray-500">{contact.phone}</p>
                            {contact.email ? (
                              <p className="text-xs text-gray-400 mt-1">
                                {contact.email}
                              </p>
                            ) : null}
                          </div>

                          <button
                            onClick={() => handleRemoveMember(group.id, contact.id)}
                            className={ui.dangerButton}
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