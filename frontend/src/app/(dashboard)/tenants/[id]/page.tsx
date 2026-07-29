'use client';

import { useParams } from 'next/navigation';
import CompanyDetailPage from '@/components/companies/CompanyDetailPage';

export default function TenantDetailRoute() {
  const params = useParams<{ id: string }>();

  return <CompanyDetailPage companyId={params.id} />;
}
