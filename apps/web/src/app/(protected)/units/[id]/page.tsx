import { UnitDetail } from '@/components/resources/unit-detail';

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UnitDetail id={id} />;
}
