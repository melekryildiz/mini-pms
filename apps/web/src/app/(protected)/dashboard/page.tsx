import Link from 'next/link';

const resourceCards = [
  {
    href: '/units',
    title: 'Birimler',
    description: 'Organizasyon ağacını ve birim durumlarını görüntüleyin.',
    icon: 'B',
  },
  {
    href: '/devices',
    title: 'Cihazlar',
    description: 'Sisteme bağlı sayaç ve cihazları takip edin.',
    icon: 'C',
  },
  {
    href: '/reactive-limits',
    title: 'Reaktif Limitler',
    description: 'Birimler için tanımlanmış limitleri inceleyin.',
    icon: 'R',
  },
] as const;

export default function DashboardPage() {
  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Genel Bakış</p>
          <h1 className="page-title">Mini PMS'e hoş geldiniz</h1>
          <p className="muted">
            Organizasyon birimlerini, bağlı cihazları ve reaktif limitleri
            güvenli bir çalışma alanından takip edin.
          </p>
        </div>

        <div className="hero-status">
          <span className="hero-status-icon">✓</span>
          <div>
            <strong>Ortak altyapı hazır</strong>
            <small>Kimlik ve rol kontrolleri etkin</small>
          </div>
        </div>
      </section>

      <section aria-labelledby="quick-access-title" className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Hızlı Erişim</p>
            <h2 id="quick-access-title">İzleme alanları</h2>
          </div>
          <span className="read-only-note">Rolünüze uygun görünüm</span>
        </div>

        <div className="resource-grid">
          {resourceCards.map((card) => (
            <Link className="resource-card" href={card.href} key={card.href}>
              <span aria-hidden="true" className="resource-icon">
                {card.icon}
              </span>
              <div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </div>
              <span aria-hidden="true" className="card-arrow">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="info-panel">
        <span aria-hidden="true" className="info-icon">
          i
        </span>
        <div>
          <h2>Yetkiler rolünüze göre uygulanır</h2>
          <p>
            Menü yalnızca erişebildiğiniz alanları gösterir. Oluşturma,
            düzenleme ve silme işlemleri ayrıca API Gateway tarafından kontrol
            edilir.
          </p>
        </div>
      </section>
    </div>
  );
}
