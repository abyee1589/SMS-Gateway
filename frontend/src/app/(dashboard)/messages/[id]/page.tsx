'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';
import toast from 'react-hot-toast';

type Message = {
  id: string;
  recipient: string;
  content: string;
  status: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
};

export default function MessageDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [message, setMessage] = useState<Message | null>(null);
  const [recipient, setRecipient] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  async function loadMessage() {
    const token = getToken();
    if (!token) return;

    try {
      const data = await apiFetch<Message>(
        `/messages/${params.id}`,
        undefined,
        token,
      );

      setMessage(data);
      setRecipient(data.recipient);
      setContent(data.content);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load message');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessage();
  }, [params.id]);

  async function submitMessage(forceDuplicate = false) {
    const token = getToken();
    if (!token || !message) return;

    if (!recipient.trim() || !content.trim()) {
      toast.error('Recipient and message are required');
      return;
    }

    const isRetryable = ['failed', 'dead_letter'].includes(message.status);

    const unchanged =
      recipient.trim() === message.recipient &&
      content.trim() === message.content;

    if (!isRetryable && unchanged && !forceDuplicate) {
      setConfirmDuplicate(true);
      return;
    }

    const endpoint = isRetryable
      ? `/messages/${params.id}/retry`
      : '/messages';

    const method = isRetryable ? 'PATCH' : 'POST';

    setResending(true);

    try {
      await apiFetch(
        endpoint,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: recipient.trim(),
            content: content.trim(),
            forceSend: !isRetryable,
          }),
        },
        token,
      );

      toast.success(
        isRetryable
          ? 'Message queued for retry'
          : 'Message sent again successfully',
      );

      router.push('/messages/sent');
    } catch (error) {
      console.error(error);
      toast.error(
        isRetryable
          ? 'Failed to retry message'
          : 'Failed to send message again',
      );
    } finally {
      setResending(false);
      setConfirmDuplicate(false);
    }
  }

  function handleResend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submitMessage(false);
  }

  if (loading) {
    return <div className="text-gray-500">Loading message...</div>;
  }

  if (!message) {
    return <div className="text-red-600">Message not found.</div>;
  }

  const isRetryable = ['failed', 'dead_letter'].includes(message.status);

  return (
    <>
      <div className={ui.page}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={ui.sectionTitle}>Message Detail</h2>
            <p className={ui.sectionSubtitle}>
              Review message details and{' '}
              {isRetryable ? 'retry' : 'send again'} with adjustments.
            </p>
          </div>

          <Link href="/messages/sent" className={ui.secondaryButton}>
            Back to Messages
          </Link>
        </div>

        <div className={ui.card}>
          <div className={ui.cardBody}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <DetailItem label="Status" value={message.status} />
              <DetailItem label="Recipient" value={message.recipient} />
              <DetailItem
                label="Provider ID"
                value={message.providerMessageId ?? 'N/A'}
              />
              <DetailItem
                label="Created"
                value={new Date(message.createdAt).toLocaleString()}
              />
              <DetailItem
                label="Sent"
                value={
                  message.sentAt
                    ? new Date(message.sentAt).toLocaleString()
                    : 'N/A'
                }
              />
              <DetailItem
                label="Delivered"
                value={
                  message.deliveredAt
                    ? new Date(message.deliveredAt).toLocaleString()
                    : 'N/A'
                }
              />
            </div>

            {message.errorMessage ? (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {message.errorMessage}
              </div>
            ) : null}
          </div>
        </div>

        <div className={ui.card}>
          <div className={ui.cardBody}>
            <h3 className={ui.sectionTitle}>
              {isRetryable ? 'Retry Message' : 'Send Again'}
            </h3>

            <p className={ui.sectionSubtitle}>
              {isRetryable
                ? 'Adjust recipient or content before retrying this failed message.'
                : 'This will create a new message using the adjusted recipient and content.'}
            </p>

            <form onSubmit={handleResend} className="mt-6 space-y-4">
              <div className="space-y-1">
                <label className={ui.label}>Recipient</label>
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className={ui.input}
                />
                <p className="text-xs text-gray-500">
                  Use international format, for example +251915948189.
                </p>
              </div>

              <div className="space-y-1">
                <label className={ui.label}>Message</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className={ui.textarea}
                />
              </div>

              <button
                type="submit"
                disabled={resending}
                className={ui.primaryButton}
              >
                {resending
                  ? isRetryable
                    ? 'Retrying...'
                    : 'Sending...'
                  : isRetryable
                    ? 'Retry Message'
                    : 'Send Again'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {confirmDuplicate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">
              Send duplicate message?
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              You did not change the recipient or message content. This will
              send the same message again.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDuplicate(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={resending}
                onClick={() => submitMessage(true)}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {resending ? 'Sending...' : 'Send Anyway'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}