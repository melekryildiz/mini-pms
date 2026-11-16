import { TopologyBrowser } from '@/components/topology/topology-browser';

/**
 * Bu sayfa `(protected)` route grubu altında bulunur.
 *
 * Authentication kontrolünü tekrar burada yazmıyoruz. Üst protected layout
 * oturumu olmayan kullanıcıyı login sayfasına yönlendirir.
 */
export default function TopologyPage() {
  return <TopologyBrowser />;
}