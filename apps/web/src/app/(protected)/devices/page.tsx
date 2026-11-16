import { DevicesManager } from '@/components/resources/devices-manager';
import { requireUser } from '@/lib/auth/require-user';

export default async function DevicesPage() {
  const user = await requireUser();
  return <DevicesManager roles={user.roles} />;
}
