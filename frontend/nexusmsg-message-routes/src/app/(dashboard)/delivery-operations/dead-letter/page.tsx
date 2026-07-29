import MessagesListPage from '@/components/messages/MessagesListPage';

export default function DeliveryOperationsDeadLetterPage() {
  return <MessagesListPage initialTab="dead_letter" mode="operations" />;
}
