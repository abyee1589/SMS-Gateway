'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';
import toast from 'react-hot-toast';

type SendMode = 'now' | 'schedule';
type TargetMode = 'single' | 'multiple' | 'group';

type ContactGroup = {
  id: string;
  name: string;
  description?: string | null;
  contacts?: Array<{
    id: string;
    phone: string;
    firstName?: string | null;
    lastName?: string | null;
    isActive?: boolean;
  }>;
};

type BulkMessageResponse = {
  success: boolean;
  status: string;
  totalRecipients: number;
  queued: number;
  duplicatesRemoved: number;
  scheduledAt?: string | null;
  messageIds: string[];
};

function getMinScheduleDateTime() {
  const date = new Date(Date.now() + 60 * 1000);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(date.getTime() - timezoneOffsetMs);

  return localDate.toISOString().slice(0, 16);
}

function parseManualRecipients(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

export default function NewMessagePage() {
  const searchParams = useSearchParams();

  const [targetMode, setTargetMode] = useState<TargetMode>(() =>
    searchParams.get('recipient') ? 'single' : 'single',
  );
  const [recipient, setRecipient] = useState(
    () => searchParams.get('recipient') ?? '',
  );
  const [bulkRecipientsText, setBulkRecipientsText] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const [content, setContent] = useState(() => searchParams.get('content') ?? '');
  const [sendMode, setSendMode] = useState<SendMode>(() =>
    searchParams.get('mode') === 'schedule' ? 'schedule' : 'now',
  );
  const [scheduledAt, setScheduledAt] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const recipientParam = searchParams.get('recipient');
    const contentParam = searchParams.get('content');
    const modeParam = searchParams.get('mode');

    if (recipientParam !== null) {
      setTargetMode('single');
      setRecipient(recipientParam);
    }

    if (contentParam !== null) setContent(contentParam);
    if (modeParam === 'schedule') setSendMode('schedule');
  }, [searchParams]);

  useEffect(() => {
    async function loadContactGroups() {
      const token = getToken();

      if (!token) return;

      try {
        setGroupsLoading(true);
        const data = await apiFetch<ContactGroup[]>(
          '/contact-groups',
          undefined,
          token,
        );

        setContactGroups(data);
      } catch (error) {
        console.error('Failed to load contact groups', error);
      } finally {
        setGroupsLoading(false);
      }
    }

    loadContactGroups();
  }, []);

  const characterCount = content.length;

  const estimatedSegments = useMemo(() => {
    if (!content.length) return 0;
    return Math.ceil(content.length / 160);
  }, [content]);

  const manualRecipients = useMemo(
    () => parseManualRecipients(bulkRecipientsText),
    [bulkRecipientsText],
  );

  const selectedGroup = useMemo(
    () => contactGroups.find((group) => group.id === selectedGroupId),
    [contactGroups, selectedGroupId],
  );

  const selectedGroupRecipientCount =
    selectedGroup?.contacts?.filter((contact) => contact.isActive !== false)
      .length ?? 0;

  const estimatedRecipientCount = useMemo(() => {
    if (targetMode === 'single') return recipient.trim() ? 1 : 0;
    if (targetMode === 'multiple') return manualRecipients.length;
    if (targetMode === 'group') return selectedGroupRecipientCount;

    return 0;
  }, [
    targetMode,
    recipient,
    manualRecipients.length,
    selectedGroupRecipientCount,
  ]);

  const estimatedTotalSegments = estimatedSegments * estimatedRecipientCount;

  const minScheduleDateTime = useMemo(() => getMinScheduleDateTime(), []);

  const isBulkMode = targetMode === 'multiple' || targetMode === 'group';

  const submitButtonText = loading
    ? sendMode === 'schedule'
      ? isBulkMode
        ? 'Scheduling bulk...'
        : 'Scheduling...'
      : isBulkMode
        ? 'Sending bulk...'
        : 'Sending...'
    : sendMode === 'schedule'
      ? isBulkMode
        ? 'Schedule Bulk SMS'
        : 'Schedule Message'
      : isBulkMode
        ? 'Send Bulk SMS'
        : 'Send Message';

  function getScheduledIso() {
    if (!scheduledAt) return null;

    const date = new Date(scheduledAt);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  }

  function resetForm() {
    setTargetMode('single');
    setRecipient('');
    setBulkRecipientsText('');
    setSelectedGroupId('');
    setContent('');
    setScheduledAt('');
    setSendMode('now');
  }

  function validateTarget() {
    if (targetMode === 'single' && !recipient.trim()) {
      toast.error('Recipient phone number is required');
      return false;
    }

    if (targetMode === 'multiple' && manualRecipients.length === 0) {
      toast.error('Add at least one recipient phone number');
      return false;
    }

    if (targetMode === 'group' && !selectedGroupId) {
      toast.error('Please select a contact group');
      return false;
    }

    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!validateTarget()) {
      return;
    }

    if (!content.trim()) {
      toast.error('Message is required');
      return;
    }

    let scheduledIso: string | null = null;

    if (sendMode === 'schedule') {
      scheduledIso = getScheduledIso();

      if (!scheduledIso) {
        toast.error('Please select a valid schedule date and time');
        return;
      }

      if (new Date(scheduledIso).getTime() <= Date.now()) {
        toast.error('Scheduled time must be in the future');
        return;
      }
    }

    setLoading(true);

    try {
      if (targetMode === 'single') {
        await apiFetch(
          '/messages',
          {
            method: 'POST',
            body: JSON.stringify({
              recipient: recipient.trim(),
              content: content.trim(),
              ...(sendMode === 'schedule' && scheduledIso
                ? { scheduledAt: scheduledIso }
                : {}),
            }),
          },
          token,
        );

        toast.success(
          sendMode === 'schedule'
            ? 'Message scheduled successfully'
            : 'Message queued successfully',
        );
      } else {
        const payload =
          targetMode === 'multiple'
            ? {
                recipients: manualRecipients,
                content: content.trim(),
                ...(sendMode === 'schedule' && scheduledIso
                  ? { scheduledAt: scheduledIso }
                  : {}),
              }
            : {
                contactGroupId: selectedGroupId,
                content: content.trim(),
                ...(sendMode === 'schedule' && scheduledIso
                  ? { scheduledAt: scheduledIso }
                  : {}),
              };

        const response = await apiFetch<BulkMessageResponse>(
          '/messages/bulk',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          token,
        );

        toast.success(
          sendMode === 'schedule'
            ? `${response.totalRecipients} SMS scheduled successfully`
            : `${response.queued} SMS queued successfully`,
        );

        if (response.duplicatesRemoved > 0) {
          toast(
            `${response.duplicatesRemoved} duplicate recipient${
              response.duplicatesRemoved === 1 ? '' : 's'
            } removed`,
          );
        }
      }

      resetForm();
    } catch (error) {
      console.error('Failed to submit message', error);

      toast.error(
        error instanceof Error
          ? error.message
          : sendMode === 'schedule'
            ? 'Failed to schedule message'
            : 'Failed to send message',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={ui.page}>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-5 text-white sm:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold">New Message</h2>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  Send now or schedule single and bulk SMS messages.
                </p>
              </div>

              <div className="grid w-full grid-cols-2 rounded-xl border border-white/10 bg-white/10 p-1 sm:inline-grid sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSendMode('now')}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    sendMode === 'now'
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  Send now
                </button>

                <button
                  type="button"
                  onClick={() => setSendMode('schedule')}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    sendMode === 'schedule'
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  Schedule
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className={ui.label}>Send To</label>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <TargetModeButton
                    active={targetMode === 'single'}
                    title="Single Number"
                    description="Send to one recipient"
                    onClick={() => setTargetMode('single')}
                  />

                  <TargetModeButton
                    active={targetMode === 'multiple'}
                    title="Multiple Numbers"
                    description="Paste many numbers"
                    onClick={() => setTargetMode('multiple')}
                  />

                  <TargetModeButton
                    active={targetMode === 'group'}
                    title="Contact Group"
                    description="Send to a saved group"
                    onClick={() => setTargetMode('group')}
                  />
                </div>
              </div>

              {targetMode === 'single' ? (
                <div className="space-y-1.5">
                  <label className={ui.label}>Recipient Phone Number</label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="+2519XXXXXXXX or 09XXXXXXXX"
                    className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                  />
                  <p className="text-xs leading-5 text-slate-400">
                    Ethiopian local numbers will be normalized automatically by
                    the backend.
                  </p>
                </div>
              ) : null}

              {targetMode === 'multiple' ? (
                <div className="space-y-1.5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <label className={ui.label}>Recipient Phone Numbers</label>
                    <span className="text-xs text-slate-400">
                      {manualRecipients.length} recipient
                      {manualRecipients.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <textarea
                    value={bulkRecipientsText}
                    onChange={(e) => setBulkRecipientsText(e.target.value)}
                    placeholder={`0915948189\n0911111111\nor comma-separated numbers`}
                    className={`${ui.textarea} min-h-36 transition focus:ring-4 focus:ring-blue-100`}
                  />

                  <p className="text-xs leading-5 text-slate-400">
                    Separate numbers with a new line, comma, or semicolon.
                    Duplicates are removed automatically.
                  </p>
                </div>
              ) : null}

              {targetMode === 'group' ? (
                <div className="space-y-1.5">
                  <label className={ui.label}>Contact Group</label>

                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className={`${ui.select} transition focus:ring-4 focus:ring-blue-100`}
                    disabled={groupsLoading}
                  >
                    <option value="">
                      {groupsLoading ? 'Loading groups...' : 'Select group'}
                    </option>

                    {contactGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.contacts?.length ?? 0} contacts)
                      </option>
                    ))}
                  </select>

                  {selectedGroup ? (
                    <p className="text-xs leading-5 text-slate-400">
                      This will send to {selectedGroupRecipientCount} active
                      contact
                      {selectedGroupRecipientCount === 1 ? '' : 's'} in{' '}
                      <span className="font-semibold">
                        {selectedGroup.name}
                      </span>
                      .
                    </p>
                  ) : (
                    <p className="text-xs leading-5 text-slate-400">
                      Choose a saved contact group. You can manage groups from
                      the Groups page.
                    </p>
                  )}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <label className={ui.label}>Message</label>
                  <span className="text-xs text-slate-400">
                    {characterCount}/1600 · {estimatedSegments} segment
                    {estimatedSegments === 1 ? '' : 's'}
                  </span>
                </div>

                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your SMS message..."
                  className={`${ui.textarea} min-h-40 transition focus:ring-4 focus:ring-blue-100`}
                  maxLength={1600}
                />
              </div>

              {sendMode === 'schedule' ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                      ⏰
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          Schedule delivery
                        </p>
                        <p className="mt-0.5 text-sm leading-6 text-slate-500">
                          Choose when this SMS should be queued for sending.
                        </p>
                      </div>

                      <input
                        type="datetime-local"
                        min={minScheduleDateTime}
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      />

                      {scheduledAt ? (
                        <p className="break-words text-xs leading-5 text-blue-700">
                          This message will be scheduled for{' '}
                          {new Date(scheduledAt).toLocaleString()}.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {submitButtonText}
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 sm:w-auto"
                >
                  Clear
                </button>
              </div>
            </form>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-900">Message Summary</p>

            <div className="mt-4 space-y-3 text-sm">
              <SummaryRow
                label="Mode"
                value={sendMode === 'schedule' ? 'Scheduled' : 'Immediate'}
              />

              <SummaryRow
                label="Target"
                value={
                  targetMode === 'single'
                    ? 'Single number'
                    : targetMode === 'multiple'
                      ? 'Multiple numbers'
                      : 'Contact group'
                }
              />

              <SummaryRow label="Characters" value={characterCount} />

              <SummaryRow
                label="Estimated segments"
                value={estimatedSegments}
              />

              <SummaryRow
                label="Recipients"
                value={estimatedRecipientCount || 'Not set'}
              />

              {estimatedRecipientCount > 0 ? (
                <SummaryRow
                  label="Estimated SMS usage"
                  value={estimatedTotalSegments || estimatedRecipientCount}
                />
              ) : null}

              {targetMode === 'single' ? (
                <SummaryRow label="Recipient" value={recipient || 'Not set'} />
              ) : null}

              {targetMode === 'group' ? (
                <SummaryRow
                  label="Group"
                  value={selectedGroup?.name || 'Not set'}
                />
              ) : null}
            </div>
          </div>

          {isBulkMode ? (
            <div className="rounded-2xl border border-yellow-100 bg-yellow-50 p-5">
              <p className="text-sm font-bold text-yellow-900">
                Bulk SMS behavior
              </p>
              <p className="mt-2 text-sm leading-6 text-yellow-800">
                Bulk SMS creates one message per recipient. Each recipient gets
                separate delivery tracking, retry status, and quota usage.
              </p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
            <p className="text-sm font-bold text-emerald-900">
              Scheduling behavior
            </p>
            <p className="mt-2 text-sm leading-6 text-emerald-700">
              Scheduled messages remain in the scheduled list until their time
              arrives. You can cancel them before execution.
            </p>
          </div>

          <Link
            href="/messages/scheduled"
            className="block rounded-2xl border border-blue-100 bg-blue-50 p-5 transition hover:bg-blue-100"
          >
            <p className="text-sm font-bold text-blue-900">
              Manage scheduled messages
            </p>
            <p className="mt-2 text-sm leading-6 text-blue-700">
              View pending scheduled SMS messages and cancel them before
              execution.
            </p>
          </Link>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-900">Delivery status</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Messages move to <span className="font-semibold">sent</span> when
              accepted by the gateway. They become{' '}
              <span className="font-semibold">delivered</span> only after a DLR
              callback is received.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TargetModeButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? 'border-blue-200 bg-blue-50 ring-2 ring-blue-100'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <p
        className={`text-sm font-black ${
          active ? 'text-blue-700' : 'text-slate-900'
        }`}
      >
        {title}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </button>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold text-slate-900">
        {value}
      </span>
    </div>
  );
}