import { permanentRedirect } from "next/navigation";

export default function MuhasabeRedirectPage() {
  permanentRedirect("/admin/muhasebe");
}

