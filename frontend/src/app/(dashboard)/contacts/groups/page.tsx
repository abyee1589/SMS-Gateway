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

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'message' in error) {
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

function getContactName(contact: Contact) {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    'Unnamed Contact'
  );
}

export default function ContactGroupsPage() {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAddMembersForm, setShowAddMembersForm] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  const [groupSearch, setGroupSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [removingMemberKey, setRemovingMemberKey] = useState<string | null>(
    null,
  );
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');

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
      setError(getErrorMessage(error));
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetCreateForm() {
    setName('');
    setDescription('');
  }

  function resetAddMembersForm() {
    setSelectedGroupId('');
    setSelectedContactIds([]);
    setContactSearch('');
  }

  function openCreateForm() {
    setShowCreateForm((current) => {
      const next = !current;

      if (next) {
        setShowAddMembersForm(false);
        resetAddMembersForm();
      }

      return next;
    });
  }

  function openAddMembersForm(groupId?: string) {
    setShowAddMembersForm((current) => {
      const next = groupId ? true : !current;

      if (next) {
        setShowCreateForm(false);
        resetCreateForm();
        setSelectedGroupId(groupId ?? selectedGroupId);
      } else {
        resetAddMembersForm();
      }

      return next;
    });
  }

  async function handleCreateGroup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!name.trim()) {
      toast.error('Group name is required');
      return;
    }

    setLoading(true);
    setError('');

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

      resetCreateForm();
      setShowCreateForm(false);
      toast.success('Group created successfully');
      await loadData();
    } catch (error) {
      console.error('Failed to create group', error);
      toast.error(getErrorMessage(error));
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
      return;
    }

    setLoading(true);
    setError('');

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

      resetAddMembersForm();
      setShowAddMembersForm(false);
      toast.success('Contacts added to group successfully');
      await loadData();
    } catch (error) {
      console.error('Failed to add members', error);
      toast.error(getErrorMessage(error));
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

    const memberKey = `${groupId}-${contactId}`;

    setError('');
    setRemovingMemberKey(memberKey);

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
      toast.error(getErrorMessage(error));
    } finally {
      setRemovingMemberKey(null);
    }
  }

  function toggleContact(contactId: string) {
    setSelectedContactIds((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId],
    );
  }

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);

  const selectedGroupContactIds = useMemo(
    () => new Set(selectedGroup?.contacts.map((contact) => contact.id) ?? []),
    [selectedGroup],
  );

  const availableContacts = useMemo(() => {
    const search = contactSearch.trim().toLowerCase();

    return contacts
      .filter((contact) => !selectedGroupContactIds.has(contact.id))
      .filter((contact) => {
        if (!search) return true;

        const fullName = getContactName(contact).toLowerCase();

        return (
          fullName.includes(search) ||
          contact.phone.toLowerCase().includes(search) ||
          (contact.email ?? '').toLowerCase().includes(search)
        );
      });
  }, [contacts, contactSearch, selectedGroupContactIds]);

  const filteredGroups = useMemo(() => {
    const search = groupSearch.trim().toLowerCase();

    if (!search) return groups;

    return groups.filter((group) => {
      const memberText = group.contacts
        .map((contact) =>
          [getContactName(contact), contact.phone, contact.email]
            .filter(Boolean)
            .join(' '),
        )
        .join(' ')
        .toLowerCase();

      return (
        group.name.toLowerCase().includes(search) ||
        (group.description ?? '').toLowerCase().includes(search) ||
        memberText.includes(search)
      );
    });
  }, [groups, groupSearch]);

  const totalGroups = groups.length;

  const totalMembers = useMemo(
    () => groups.reduce((sum, group) => sum + group.contacts.length, 0),
    [groups],
  );

  const emptyGroups = groups.filter((group) => group.contacts.length === 0).length;

  const largestGroupMembers = groups.reduce(
    (max, group) => Math.max(max, group.contacts.length),
    0,
  );

  return (
    <div className={ui.page}>
      {error ? <div className={ui.alertError}>{error}</div> : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Groups" value={formatNumber(totalGroups)} />
        <StatCard label="Total Members" value={formatNumber(totalMembers)} />
        <StatCard label="Empty Groups" value={formatNumber(emptyGroups)} />
        <StatCard
          label="Largest Group"
          value={`${formatNumber(largestGroupMembers)} members`}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className={ui.sectionTitle}>Contact Groups</h2>
            <p className={ui.sectionSubtitle}>
              Organize contacts into reusable groups for bulk SMS sending.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={openCreateForm}
              className={`${ui.primaryButton} justify-center`}
            >
              {showCreateForm ? 'Close Form' : 'New Group'}
            </button>

            <button
              type="button"
              onClick={() => openAddMembersForm()}
              disabled={groups.length === 0 || contacts.length === 0}
              className={`${ui.secondaryButton} justify-center`}
            >
              {showAddMembersForm ? 'Close Members' : 'Add Members'}
            </button>
          </div>
        </div>

        {showCreateForm ? (
          <div className="border-b border-slate-100 bg-slate-50 p-4 sm:p-6">
            <form
              onSubmit={handleCreateGroup}
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              <Field label="Group Name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                  placeholder="Customers, Leads, Staff..."
                />
              </Field>

              <Field label="Description">
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                  placeholder="Optional description"
                />
              </Field>

              <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={loading}
                  className={`${ui.primaryButton} w-full justify-center sm:w-auto`}
                >
                  {loading ? 'Creating...' : 'Create Group'}
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    resetCreateForm();
                    setShowCreateForm(false);
                  }}
                  className={`${ui.secondaryButton} w-full justify-center sm:w-auto`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {showAddMembersForm ? (
          <div className="border-b border-slate-100 bg-blue-50/50 p-4 sm:p-6">
            <form onSubmit={handleAddMembers} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field label="Choose Group">
                  <select
                    value={selectedGroupId}
                    onChange={(e) => {
                      setSelectedGroupId(e.target.value);
                      setSelectedContactIds([]);
                    }}
                    className={`${ui.select} transition focus:ring-4 focus:ring-blue-100`}
                  >
                    <option value="">Select a group</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.contacts.length} members)
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Search Contacts">
                  <input
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className={ui.input}
                    placeholder="Search by name, phone, or email"
                  />
                </Field>
              </div>

              <div>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <label className={ui.label}>Select Contacts</label>

                  {selectedContactIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedContactIds([])}
                      className="text-xs font-bold text-red-600 hover:text-red-700"
                    >
                      Clear selected ({selectedContactIds.length})
                    </button>
                  ) : null}
                </div>

                {!selectedGroupId ? (
                  <div className="rounded-2xl border border-dashed border-blue-200 bg-white/70 py-10 text-center text-sm text-slate-500">
                    Select a group first.
                  </div>
                ) : availableContacts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-blue-200 bg-white/70 py-10 text-center text-sm text-slate-500">
                    No contacts available for this group.
                  </div>
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-blue-100 bg-white p-3">
                    {availableContacts.map((contact) => {
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
                            <p className="break-words font-medium text-slate-900">
                              {getContactName(contact)}
                            </p>
                            <p className="break-words text-sm text-slate-500">
                              {contact.phone}
                            </p>
                            {contact.email ? (
                              <p className="mt-1 break-words text-xs text-slate-400">
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

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={loading || !selectedGroupId}
                  className={`${ui.primaryButton} w-full justify-center sm:w-auto`}
                >
                  {loading
                    ? 'Saving...'
                    : `Add ${selectedContactIds.length || ''} Contact${
                        selectedContactIds.length === 1 ? '' : 's'
                      }`}
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    resetAddMembersForm();
                    setShowAddMembersForm(false);
                  }}
                  className={`${ui.secondaryButton} w-full justify-center sm:w-auto`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <div className="p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl flex-1">
              <input
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className={ui.input}
                placeholder="Search groups, descriptions, or members"
              />
            </div>

            {groupSearch ? (
              <button
                type="button"
                onClick={() => setGroupSearch('')}
                className={`${ui.secondaryButton} justify-center`}
              >
                Clear Search
              </button>
            ) : null}
          </div>

          {pageLoading ? (
            <div className="space-y-3">
              <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              No groups yet.
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              No groups match your search.
            </div>
          ) : (
            <div className="max-h-[900px] space-y-4 overflow-y-auto pr-2">
              {filteredGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  removingMemberKey={removingMemberKey}
                  onAddMembers={() => openAddMembersForm(group.id)}
                  onRemoveMember={handleRemoveMember}
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

function GroupCard({
  group,
  removingMemberKey,
  onAddMembers,
  onRemoveMember,
}: {
  group: ContactGroup;
  removingMemberKey: string | null;
  onAddMembers: () => void;
  onRemoveMember: (groupId: string, contactId: string) => Promise<void>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-lg font-black text-slate-900">
              {group.name}
            </p>

            <span className="inline-flex h-7 w-fit items-center justify-center rounded-full bg-blue-100 px-2.5 text-xs font-bold text-blue-700">
              {formatNumber(group.contacts.length)} member
              {group.contacts.length === 1 ? '' : 's'}
            </span>
          </div>

          {group.description ? (
            <p className="mt-1 break-words text-sm leading-6 text-slate-500">
              {group.description}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">
              No description provided.
            </p>
          )}

          <p className="mt-2 text-xs text-slate-400">
            Created {new Date(group.createdAt).toLocaleDateString()}
          </p>
        </div>

        <button
          type="button"
          onClick={onAddMembers}
          className={`${ui.secondaryButton} w-full justify-center md:w-auto`}
        >
          Add Members
        </button>
      </div>

      {group.contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-6 text-center text-sm text-slate-500">
          No contacts in this group yet.
        </div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-3">
          {group.contacts.map((contact) => {
            const memberKey = `${group.id}-${contact.id}`;
            const removing = removingMemberKey === memberKey;

            return (
              <div
                key={contact.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium text-slate-900">
                    {getContactName(contact)}
                  </p>
                  <p className="break-words text-sm text-slate-500">
                    {contact.phone}
                  </p>
                  {contact.email ? (
                    <p className="mt-1 break-words text-xs text-slate-400">
                      {contact.email}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={removing}
                  onClick={() => onRemoveMember(group.id, contact.id)}
                  className={`${ui.dangerButton} w-full justify-center md:w-auto`}
                >
                  {removing ? 'Removing...' : 'Remove'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
