import { UnitsManager } from '@/components/resources/units-manager';
import { requireUser } from '@/lib/auth/require-user';

export default async function UnitsPage() {
  // requireUser React cache kullandığı için protected layout ile aynı request'te
  // ikinci kez /auth/me çağrılmaz; roller doğrudan ekran bileşenine aktarılır.
  const user = await requireUser();
  return <UnitsManager roles={user.roles} />;
}
