'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';

import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';
import toast from 'react-hot-toast';

type SendMode = 'now' | 'schedule';
type TargetMode = 'single' | 'multiple' | 'group' | 'excel';

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

type ExcelRow = Record<string, string | number | boolean | null | undefined>;

type ApiErrorShape = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
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

function normalizeHeader(value: string) {
  return value.toLowerCase().trim().replace(/[\s_-]+/g, '');
}

function isLikelyPhoneHeader(header: string) {
  const normalized = normalizeHeader(header);

  return [
    'phone',
    'phonenumber',
    'mobile',
    'mobilenumber',
    'recipient',
    'recipients',
    'number',
    'contact',
    'contactnumber',
    'tel',
    'telephone',
  ].includes(normalized);
}

function cleanExcelCell(value: unknown) {
  if (value === null || value === undefined) return '';

  return String(value).trim();
}

function extractPhonesFromRows(rows: ExcelRow[]) {
  if (!rows.length) return [];

  const headers = Object.keys(rows[0] ?? {});
  const phoneHeader = headers.find((header) => isLikelyPhoneHeader(header));

  const phones: string[] = [];

  for (const row of rows) {
    if (phoneHeader) {
      const phone = cleanExcelCell(row[phoneHeader]);

      if (phone) {
        phones.push(phone);
      }

      continue;
    }

    for (const value of Object.values(row)) {
      const cell = cleanExcelCell(value);

      if (!cell) continue;

      const looksLikePhone =
        cell.startsWith('+') ||
        cell.startsWith('0') ||
        cell.startsWith('251') ||
        /^[0-9]{8,15}$/.test(cell);

      if (looksLikePhone) {
        phones.push(cell);
        break;
      }
    }
  }

  return [...new Set(phones.map((phone) => phone.trim()).filter(Boolean))];
}

function getErrorMessage(error: unknown, fallback = 'Request failed') {
  if (typeof error === 'string') return error;

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const apiError = error as ApiErrorShape;

    if (Array.isArray(apiError.message)) {
      return apiError.message[0] || fallback;
    }

    if (typeof apiError.message === 'string' && apiError.message.trim()) {
      return apiError.message;
    }

    if (typeof apiError.error === 'string' && apiError.error.trim()) {
      return apiError.error;
    }
  }

  return fallback;
}

function getMessageSubmitError(error: unknown, sendMode: SendMode) {
  const fallback =
    sendMode === 'schedule'
      ? 'Failed to schedule message'
      : 'Failed to send message';

  const message = getErrorMessage(error, fallback);
  const normalized = message.toLowerCase();

  if (normalized.includes('subscription') && normalized.includes('expired')) {
    return 'Your company subscription has expired. Please renew the subscription before sending SMS.';
  }

  if (normalized.includes('tenant suspended') || normalized.includes('suspended')) {
    return 'SMS sending is blocked because this company is suspended.';
  }

  if (normalized.includes('quota') && normalized.includes('exceeded')) {
    return 'SMS quota is not enough for this message. Please add more SMS credit before sending.';
  }

  if (normalized.includes('not enough') && normalized.includes('sms')) {
    return 'SMS credit is not enough for this message. Please add more SMS credit before sending.';
  }

  if (normalized.includes('subscription') && normalized.includes('inactive')) {
    return 'This company does not have an active subscription. Please activate or assign a subscription plan first.';
  }

  if (normalized.includes('expired')) {
    return 'This action is blocked because the subscription or account status is expired.';
  }

  return message;
}

function formatNumber(value: number | string) {
  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) return String(value);

  return new Intl.NumberFormat('en-US').format(numberValue);
}

export default function NewMessagePage() {
  const searchParams = useSearchParams();
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);

  const [targetMode, setTargetMode] = useState<TargetMode>(() =>
    searchParams.get('recipient') ? 'single' : 'single',
  );

  const [recipient, setRecipient] = useState(
    () => searchParams.get('recipient') ?? '',
  );

  const [bulkRecipientsText, setBulkRecipientsText] = useState('');
  const [excelRecipients, setExcelRecipients] = useState<string[]>([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelLoading, setExcelLoading] = useState(false);

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
        toast.error(getErrorMessage(error, 'Failed to load contact groups'));
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
    if (targetMode === 'excel') return excelRecipients.length;

    return 0;
  }, [
    targetMode,
    recipient,
    manualRecipients.length,
    selectedGroupRecipientCount,
    excelRecipients.length,
  ]);

  const estimatedTotalSegments = estimatedSegments * estimatedRecipientCount;

  const minScheduleDateTime = useMemo(() => getMinScheduleDateTime(), []);

  const isBulkMode =
    targetMode === 'multiple' ||
    targetMode === 'group' ||
    targetMode === 'excel';

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
    clearExcelImport();
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

    if (targetMode === 'excel' && excelRecipients.length === 0) {
      toast.error('Import an Excel file with at least one phone number');
      return false;
    }

    if (targetMode === 'group' && !selectedGroupId) {
      toast.error('Please select a contact group');
      return false;
    }

    return true;
  }

  function clearExcelImport() {
    setExcelRecipients([]);
    setExcelFileName('');

    if (excelFileInputRef.current) {
      excelFileInputRef.current.value = '';
    }
  }

  async function handleExcelFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowed =
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls') ||
      file.name.endsWith('.csv');

    if (!allowed) {
      toast.error('Please upload an Excel or CSV file');
      event.target.value = '';
      return;
    }

    setExcelLoading(true);
    setExcelFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        clearExcelImport();
        toast.error('The file does not contain any sheet');
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];

      const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, {
        defval: '',
      });

      const phones = extractPhonesFromRows(rows);

      if (!phones.length) {
        clearExcelImport();
        toast.error(
          'No phone numbers found. Use a column named phone, phoneNumber, mobile, recipient, or number.',
        );
        return;
      }

      setExcelRecipients(phones);
      toast.success(`${formatNumber(phones.length)} recipient number(s) imported`);
    } catch (error) {
      console.error('Failed to read Excel file', error);
      clearExcelImport();
      toast.error(getErrorMessage(error, 'Failed to read Excel file'));
    } finally {
      setExcelLoading(false);
    }
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
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
            : targetMode === 'excel'
              ? {
                  recipients: excelRecipients,
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
            ? `${formatNumber(response.totalRecipients)} SMS scheduled successfully`
            : `${formatNumber(response.queued)} SMS queued successfully`,
        );

        if (response.duplicatesRemoved > 0) {
          toast(
            `${formatNumber(response.duplicatesRemoved)} duplicate recipient${
              response.duplicatesRemoved === 1 ? '' : 's'
            } removed`,
          );
        }
      }

      resetForm();
    } catch (error) {
      console.error('Failed to submit message', error);
      toast.error(getMessageSubmitError(error, sendMode));
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

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
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

                  <TargetModeButton
                    active={targetMode === 'excel'}
                    title="Import Excel"
                    description="Upload xlsx, xls, or csv"
                    onClick={() => setTargetMode('excel')}
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
                      {formatNumber(manualRecipients.length)} recipient
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

              {targetMode === 'excel' ? (
                <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <div>
                    <label className={ui.label}>Import Recipients From Excel</label>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Upload a file with a column named{' '}
                      <span className="font-semibold">phone</span>,{' '}
                      <span className="font-semibold">phoneNumber</span>,{' '}
                      <span className="font-semibold">mobile</span>,{' '}
                      <span className="font-semibold">recipient</span>, or{' '}
                      <span className="font-semibold">number</span>.
                    </p>
                  </div>

                  <input
                    ref={excelFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleExcelFileChange}
                    className="block w-full cursor-pointer rounded-xl border border-blue-100 bg-white text-sm text-slate-700 file:mr-4 file:border-0 file:bg-blue-600 file:px-4 file:py-3 file:text-sm file:font-bold file:text-white hover:file:bg-blue-700"
                  />

                  {excelLoading ? (
                    <p className="text-sm font-semibold text-blue-700">
                      Reading file...
                    </p>
                  ) : null}

                  {excelFileName ? (
                    <div className="rounded-xl bg-white p-3 text-sm">
                      <p className="font-semibold text-slate-800">
                        {excelFileName}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {formatNumber(excelRecipients.length)} recipient
                        {excelRecipients.length === 1 ? '' : 's'} imported
                      </p>
                    </div>
                  ) : null}

                  {excelRecipients.length > 0 ? (
                    <div className="rounded-xl border border-blue-100 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                          Preview
                        </p>
                        <button
                          type="button"
                          onClick={clearExcelImport}
                          className="text-xs font-bold text-red-600 hover:text-red-700"
                        >
                          Clear import
                        </button>
                      </div>

                      <div className="mt-2 max-h-32 overflow-auto text-sm text-slate-600">
                        {excelRecipients.slice(0, 20).map((phone) => (
                          <p key={phone}>{phone}</p>
                        ))}

                        {excelRecipients.length > 20 ? (
                          <p className="mt-1 text-xs text-slate-400">
                            +{formatNumber(excelRecipients.length - 20)} more
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
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
                        {group.name} ({formatNumber(group.contacts?.length ?? 0)} contacts)
                      </option>
                    ))}
                  </select>

                  {selectedGroup ? (
                    <p className="text-xs leading-5 text-slate-400">
                      This will send to {formatNumber(selectedGroupRecipientCount)} active
                      contact
                      {selectedGroupRecipientCount === 1 ? '' : 's'} in{' '}
                      <span className="font-semibold">{selectedGroup.name}</span>.
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
                    {formatNumber(characterCount)}/1,600 · {formatNumber(estimatedSegments)} segment
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
                  disabled={loading || excelLoading}
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
                      : targetMode === 'excel'
                        ? 'Excel import'
                        : 'Contact group'
                }
              />

              <SummaryRow label="Characters" value={formatNumber(characterCount)} />

              <SummaryRow
                label="Estimated segments"
                value={formatNumber(estimatedSegments)}
              />

              <SummaryRow
                label="Recipients"
                value={estimatedRecipientCount ? formatNumber(estimatedRecipientCount) : 'Not set'}
              />

              {estimatedRecipientCount > 0 ? (
                <SummaryRow
                  label="Estimated SMS usage"
                  value={formatNumber(estimatedTotalSegments || estimatedRecipientCount)}
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

              {targetMode === 'excel' ? (
                <SummaryRow
                  label="Imported file"
                  value={excelFileName || 'Not set'}
                />
              ) : null}
            </div>
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
              execution, if you want.
            </p>
          </Link>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
            <p className="text-sm font-bold text-emerald-900">
              Excel import format
            </p>
            <p className="mt-2 text-sm leading-6 text-emerald-700">
              Your file should contain a phone number column named phone,
              phoneNumber, mobile, recipient, or number.
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
