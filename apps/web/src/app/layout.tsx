import './global.css';

export const metadata = {
  title: 'Mini PMS',
  description: 'Power Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
