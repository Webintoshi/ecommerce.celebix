import { OwnerAuthRecoverScreen } from "@/components/OwnerAuthRecoverScreen";

interface RecoverPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function RecoverPage({ searchParams }: RecoverPageProps) {
  const params = await searchParams;

  return <OwnerAuthRecoverScreen nextPath={params.next} error={params.error} />;
}
