import type { AppRole } from '@/types/auth';

export type NavigationItem = {
  label: string;
  href: string;
  description: string;
  icon: string;
  section: NavigationSection;
  // Alan boşsa oturum açmış her kullanıcı menüyü görebilir.
  roles?: readonly AppRole[];
};

export type NavigationSection = 'general' | 'monitoring' | 'management';

export const navigationSections: ReadonlyArray<{
  id: NavigationSection;
  label: string;
}> = [
  { id: 'general', label: 'Genel' },
  { id: 'monitoring', label: 'İzleme' },
  // Bu bölümde ileride admin/operator ekranları yer alacak. Sidebar, kullanıcının
  // görebildiği bir kayıt yoksa başlığı da göstermediği için viewer boş bir
  // "Yönetim" başlığı görmez.
  { id: 'management', label: 'Yönetim' },
];

/**
 * Menü tek bir veri listesi olarak tanımlanır. Yeni bir ekran eklerken Sidebar
 * JSX'ini değiştirmek yerine bu listeye bir kayıt eklememiz yeterlidir.
 */
export const navigationItems: readonly NavigationItem[] = [
  {
    label: 'Genel Bakış',
    href: '/dashboard',
    description: 'Sistemin başlangıç ekranı',
    icon: 'G',
    section: 'general',
  },
  {
    label: 'Birimler',
    href: '/units',
    description: 'Organizasyon yapısını görüntüle',
    icon: 'B',
    section: 'monitoring',
    roles: ['admin', 'operator', 'viewer'],
  },
  {
    // Topoloji salt-okunur bir izleme ekranıdır; viewer dahil bütün okuma
    // rolleri erişebilir. Yazma yetkileri bu ekranda sunulmaz.
    label: 'Topoloji',
    href: '/topology',
    description: 'Birim ağacını hiyerarşik görüntüle',
    icon: 'T',
    section: 'monitoring',
    roles: ['admin', 'operator', 'viewer'],
  },
  {
    label: 'Cihazlar',
    href: '/devices',
    description: 'Sayaç ve cihazları görüntüle',
    icon: 'C',
    section: 'monitoring',
    roles: ['admin', 'operator', 'viewer'],
  },
  {
    label: 'Reaktif Limitler',
    href: '/reactive-limits',
    description: 'Birim limitlerini görüntüle',
    icon: 'R',
    section: 'monitoring',
    roles: ['admin', 'operator', 'viewer'],
  },
];
