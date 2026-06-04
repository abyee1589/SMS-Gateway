import { redirect } from 'next/navigation';

export default function SentMessagesPage() {
  redirect('/messages/outbound');
}