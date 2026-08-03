import { permanentRedirect } from "next/navigation";

export default async function NewPolicyPage() {
  permanentRedirect("/content/policies");
}
