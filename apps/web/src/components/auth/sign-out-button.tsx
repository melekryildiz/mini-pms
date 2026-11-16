import { logoutAction } from '@/actions/logout';

export function SignOutButton() {
  return (
    // Form action tarayıcıdaki iki ayrı isteğe güvenmek yerine cookie temizliği
    // ve Keycloak yönlendirmesini tek server action içinde tamamlar.
    <form action={logoutAction}>
      <button className="secondary-button" type="submit">
        Çıkış yap
      </button>
    </form>
  );
}
