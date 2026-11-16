import { ReactiveLimitsManager } from '@/components/resources/reactive-limits-manager';
import { requireUser } from '@/lib/auth/require-user';

export default async function ReactiveLimitsPage() {
  const user = await requireUser();
  return <ReactiveLimitsManager roles={user.roles} />;
}
