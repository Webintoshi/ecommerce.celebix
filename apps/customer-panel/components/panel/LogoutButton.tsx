import { LogOut } from "lucide-react";

export function LogoutButton() {
  return (
    <form className="logout-control" action="/api/session/logout" method="post">
      <button className="logout-button" type="submit" aria-label="Güvenli çıkış yap">
        <LogOut aria-hidden="true" />
        <span className="logout-label">Çıkış</span>
      </button>
    </form>
  );
}
