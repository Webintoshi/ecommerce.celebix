import { redirect } from "next/navigation";
import { CUSTOMER_AUTH_URLS } from "@/lib/customer-auth-links";

export default function LoginPage() {
  redirect(CUSTOMER_AUTH_URLS.signIn);
}
