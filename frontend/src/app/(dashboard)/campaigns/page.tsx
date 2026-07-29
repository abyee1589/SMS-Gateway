"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { ui } from "@/lib/ui";
import toast from "react-hot-toast";

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
  scheduledAt?: string | null;
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

type MessageTemplate = {
  id: string;
  name: string;
  content: string;
  description?: string | null;
  isActive: boolean;
};

type TemplatePreviewResponse = {
  templateId: string | null;
  contactId: string;
  rendered: string;
  variables: {
    firstName: string;
    lastName: string;
    fullName: string;
    phone: string;
    email: string;
  };
};

type CampaignStatusFilter =
  | "all"
  | "draft"
  | "queued"
  | "sending"
  | "processing"
  | "scheduled"
  | "completed"
  | "failed"
  | "cancelled";

function getMinScheduleDateTime() {
  const date = new Date(Date.now() + 60 * 1000);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(date.getTime() - timezoneOffsetMs);

  return localDate.toISOString().slice(0, 16);
}

function formatNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0);

  if (Number.isNaN(numberValue)) return "0";

  return new Intl.NumberFormat("en-US").format(numberValue);
}

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (Array.isArray(message)) return message[0] ?? "Request failed";
    if (typeof message === "string") return message;
  }

  if (error instanceof Error) return error.message;

  return "Request failed";
}

function getContactName(contact: Contact) {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    "Unnamed Contact"
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "border-green-100 bg-green-50 text-green-700";
    case "failed":
      return "border-red-100 bg-red-50 text-red-700";
    case "processing":
    case "sending":
      return "border-yellow-100 bg-yellow-50 text-yellow-700";
    case "scheduled":
      return "border-purple-100 bg-purple-50 text-purple-700";
    case "cancelled":
      return "border-slate-200 bg-slate-100 text-slate-600";
    case "draft":
      return "border-gray-100 bg-gray-50 text-gray-600";
    default:
      return "border-blue-100 bg-blue-50 text-blue-700";
  }
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [previewContactId, setPreviewContactId] = useState("");
  const [previewText, setPreviewText] = useState("");

  const [campaignSearch, setCampaignSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>("all");
  const [contactSearch, setContactSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");

  const characterCount = message.length;
  const estimatedSegments = useMemo(() => {
    if (!message.length) return 0;
    return Math.ceil(message.length / 160);
  }, [message]);

  const totalSelectedSources = selectedContacts.length + selectedGroups.length;
  const minScheduleDateTime = useMemo(() => getMinScheduleDateTime(), []);

  const totalCampaigns = campaigns.length;
  const completedCampaigns = campaigns.filter(
    (campaign) => campaign.status === "completed",
  ).length;
  const scheduledCampaigns = campaigns.filter(
    (campaign) => campaign.status === "scheduled",
  ).length;
  const failedCampaigns = campaigns.filter(
    (campaign) => campaign.status === "failed",
  ).length;

  const totalRecipients = useMemo(
    () =>
      campaigns.reduce(
        (sum, campaign) => sum + Number(campaign.totalRecipients ?? 0),
        0,
      ),
    [campaigns],
  );

  const filteredCampaigns = useMemo(() => {
    const search = campaignSearch.trim().toLowerCase();

    return campaigns.filter((campaign) => {
      const matchesStatus =
        statusFilter === "all" || campaign.status === statusFilter;

      const matchesSearch =
        !search ||
        campaign.name.toLowerCase().includes(search) ||
        campaign.message.toLowerCase().includes(search) ||
        campaign.status.toLowerCase().includes(search);

      return matchesStatus && matchesSearch;
    });
  }, [campaigns, campaignSearch, statusFilter]);

  const filteredContacts = useMemo(() => {
    const search = contactSearch.trim().toLowerCase();

    if (!search) return contacts;

    return contacts.filter((contact) => {
      const name = getContactName(contact).toLowerCase();

      return (
        name.includes(search) ||
        contact.phone.toLowerCase().includes(search) ||
        (contact.email ?? "").toLowerCase().includes(search)
      );
    });
  }, [contacts, contactSearch]);

  const filteredGroups = useMemo(() => {
    const search = groupSearch.trim().toLowerCase();

    if (!search) return groups;

    return groups.filter(
      (group) =>
        group.name.toLowerCase().includes(search) ||
        (group.description ?? "").toLowerCase().includes(search),
    );
  }, [groups, groupSearch]);

  async function loadData() {
    const token = getToken();

    if (!token) {
      window.location.href = "/login";
      return;
    }

    try {
      setError("");

      const [
        campaignsResponse,
        contactsResponse,
        groupsResponse,
        templatesResponse,
      ] = await Promise.all([
        apiFetch<CampaignsResponse>("/campaigns", undefined, token),
        apiFetch<ContactsResponse>("/contacts", undefined, token),
        apiFetch<ContactGroup[]>("/contact-groups", undefined, token),
        apiFetch<MessageTemplate[]>(
          "/message-templates?isActive=true",
          undefined,
          token,
        ),
      ]);

      setCampaigns(campaignsResponse.data);
      setContacts(contactsResponse.data);
      setGroups(groupsResponse);
      setTemplates(templatesResponse);
    } catch (error) {
      console.error("Failed to load campaigns data", error);
      setError(getErrorMessage(error));
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetForm() {
    setName("");
    setMessage("");
    setScheduledAt("");
    setSelectedContacts([]);
    setSelectedGroups([]);
    setSelectedTemplateId("");
    setPreviewContactId("");
    setPreviewText("");
    setContactSearch("");
    setGroupSearch("");
  }

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

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId);
    setPreviewText("");

    const template = templates.find((item) => item.id === templateId);

    if (template) {
      setMessage(template.content);
    }
  }

  async function handlePreviewTemplate() {
    const token = getToken();

    if (!token) {
      window.location.href = "/login";
      return;
    }

    if (!previewContactId) {
      toast.error("Select a contact to preview");
      return;
    }

    if (!selectedTemplateId && !message.trim()) {
      toast.error("Select a template or write a message first");
      return;
    }

    setPreviewLoading(true);
    setPreviewText("");

    try {
      const payload = selectedTemplateId
        ? {
            templateId: selectedTemplateId,
            contactId: previewContactId,
          }
        : {
            content: message.trim(),
            contactId: previewContactId,
          };

      const response = await apiFetch<TemplatePreviewResponse>(
        "/message-templates/preview",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        token,
      );

      setPreviewText(response.rendered);
      toast.success("Preview generated");
    } catch (error) {
      console.error("Failed to preview template", error);
      toast.error(getErrorMessage(error));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = "/login";
      return;
    }

    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }

    if (!message.trim()) {
      toast.error("Campaign message is required");
      return;
    }

    if (selectedContacts.length === 0 && selectedGroups.length === 0) {
      toast.error("Select at least one contact or group");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await apiFetch(
        "/campaigns",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            message: message.trim(),
            templateId: selectedTemplateId || undefined,
            contactIds: selectedContacts,
            groupIds: selectedGroups,
            scheduledAt: scheduledAt || undefined,
          }),
        },
        token,
      );

      resetForm();
      setShowCreateForm(false);
      toast.success("Campaign created successfully");
      await loadData();
    } catch (error) {
      console.error("Failed to create campaign", error);
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={ui.page}>
      {error ? <div className={ui.alertError}>{error}</div> : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <StatCard label="Campaigns" value={formatNumber(totalCampaigns)} />
        <StatCard label="Completed" value={formatNumber(completedCampaigns)} />
        <StatCard label="Scheduled" value={formatNumber(scheduledCampaigns)} />
        <StatCard label="Failed" value={formatNumber(failedCampaigns)} />
        <StatCard label="Recipients" value={formatNumber(totalRecipients)} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-5 text-white sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Campaigns</h2>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Create campaign broadcasts and monitor delivery outcomes.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateForm((value) => !value)}
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-blue-50"
          >
            {showCreateForm ? "Close Form" : "+ New Campaign"}
          </button>
        </div>

        {showCreateForm ? (
          <div className="p-4 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Campaign Name">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={ui.input}
                    placeholder="Campaign name"
                  />
                </Field>

                <Field label="Schedule Time">
                  <input
                    type="datetime-local"
                    min={minScheduleDateTime}
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className={ui.input}
                  />
                  <p className="text-xs leading-5 text-slate-400">
                    Leave empty to send immediately.
                  </p>
                </Field>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <label className={ui.label}>Message</label>
                  <span className="text-xs text-slate-400">
                    {formatNumber(characterCount)}/1,600 ·{" "}
                    {formatNumber(estimatedSegments)} segment
                    {estimatedSegments === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Message Template">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                      className={ui.select}
                    >
                      <option value="">Write custom message</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs leading-5 text-slate-400">
                      Select a saved template or write a custom message.
                    </p>
                  </Field>

                  <Field label="Preview With Contact">
                    <select
                      value={previewContactId}
                      onChange={(e) => setPreviewContactId(e.target.value)}
                      className={ui.select}
                    >
                      <option value="">Select contact for preview</option>
                      {contacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {getContactName(contact)} - {contact.phone}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs leading-5 text-slate-400">
                      Preview how variables will be replaced.
                    </p>
                  </Field>
                </div>

                <textarea
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setPreviewText("");
                  }}
                  className={`${ui.textarea} min-h-40`}
                  maxLength={1600}
                  placeholder="Write your campaign SMS..."
                />

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        Personalized Message Preview
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        This preview shows one selected contact. Each recipient
                        receives their own personalized version.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handlePreviewTemplate}
                      disabled={previewLoading}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {previewLoading ? "Previewing..." : "Preview Message"}
                    </button>
                  </div>

                  {previewText ? (
                    <div className="mt-4 whitespace-pre-wrap rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                      {previewText}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-400">
                      No preview generated yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <RecipientSelector
                  title="Select Contacts"
                  count={selectedContacts.length}
                  search={contactSearch}
                  onSearchChange={setContactSearch}
                  placeholder="Search contacts by name, phone, or email"
                  emptyText="No contacts available. Create contacts first."
                >
                  {filteredContacts.map((contact) => {
                    const checked = selectedContacts.includes(contact.id);

                    return (
                      <label
                        key={contact.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                          checked
                            ? "border-blue-200 bg-blue-50"
                            : "border-slate-200 bg-white hover:border-slate-300"
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
                </RecipientSelector>

                <RecipientSelector
                  title="Select Groups"
                  count={selectedGroups.length}
                  search={groupSearch}
                  onSearchChange={setGroupSearch}
                  placeholder="Search groups by name or description"
                  emptyText="No groups available. Create groups first."
                >
                  {filteredGroups.map((group) => {
                    const checked = selectedGroups.includes(group.id);

                    return (
                      <label
                        key={group.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                          checked
                            ? "border-blue-200 bg-blue-50"
                            : "border-slate-200 bg-white hover:border-slate-300"
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
                            {formatNumber(group.contacts.length)} contact
                            {group.contacts.length === 1 ? "" : "s"}
                          </p>
                          {group.description ? (
                            <p className="mt-1 line-clamp-2 break-words text-xs text-gray-400">
                              {group.description}
                            </p>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </RecipientSelector>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  {formatNumber(totalSelectedSources)} recipient source
                  {totalSelectedSources === 1 ? "" : "s"} selected
                </p>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={resetForm}
                    className={`${ui.secondaryButton} justify-center`}
                  >
                    Clear
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`${ui.primaryButton} justify-center`}
                  >
                    {loading ? "Creating..." : "Create Campaign"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className={ui.sectionTitle}>Campaign List</h2>
              <p className={ui.sectionSubtitle}>
                Track campaign status, recipients, and outcomes.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px] lg:w-[560px]">
              <input
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
                className={ui.input}
                placeholder="Search campaigns..."
              />

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as CampaignStatusFilter)
                }
                className={ui.select}
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="queued">Queued</option>
                <option value="sending">Sending</option>
                <option value="processing">Processing</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {pageLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              Loading campaigns...
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              No campaigns found.
            </div>
          ) : (
            <div className="max-h-[780px] space-y-3 overflow-y-auto pr-1">
              {filteredCampaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
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

function StatCard({ label, value }: { label: string; value: string | number }) {
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

function RecipientSelector({
  title,
  count,
  search,
  onSearchChange,
  placeholder,
  emptyText,
  children,
}: {
  title: string;
  count: number;
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-slate-400">
          {formatNumber(count)} selected
        </span>
      </div>

      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className={`${ui.input} mb-3 bg-white`}
        placeholder={placeholder}
      />

      {!hasChildren ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center text-sm text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto">{children}</div>
      )}
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const deliveryRate =
    campaign.totalRecipients > 0
      ? Number(
          ((campaign.sentCount / campaign.totalRecipients) * 100).toFixed(1),
        )
      : 0;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words font-black text-gray-900">
              {campaign.name}
            </h3>
            <span
              className={`inline-flex h-7 w-fit items-center justify-center rounded-full border px-3 text-xs font-bold ${getStatusColor(
                campaign.status,
              )}`}
            >
              {formatStatus(campaign.status)}
            </span>
          </div>

          <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-gray-600">
            {campaign.message}
          </p>

          {campaign.scheduledAt ? (
            <p className="mt-2 break-words text-xs font-semibold text-purple-600">
              Scheduled for {new Date(campaign.scheduledAt).toLocaleString()}
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-500 sm:grid-cols-4">
            <MetricPill label="Total" value={campaign.totalRecipients} />
            <MetricPill
              label="Sent"
              value={campaign.sentCount}
              tone="success"
            />
            <MetricPill
              label="Failed"
              value={campaign.failedCount}
              tone="danger"
            />
            <MetricPill
              label="Delivery"
              value={`${deliveryRate}%`}
              tone="info"
            />
          </div>
        </div>

        <p className="shrink-0 text-xs text-gray-400 lg:text-right">
          Created {new Date(campaign.createdAt).toLocaleString()}
        </p>
      </div>
    </article>
  );
}

function MetricPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "success" | "danger" | "info";
}) {
  const classes =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "bg-red-50 text-red-700"
        : tone === "info"
          ? "bg-blue-50 text-blue-700"
          : "bg-slate-100 text-slate-600";

  return (
    <span className={`rounded-xl px-3 py-2 ${classes}`}>
      <span className="font-semibold">{label}: </span>
      <span className="font-black">
        {typeof value === "number" ? formatNumber(value) : value}
      </span>
    </span>
  );
}
