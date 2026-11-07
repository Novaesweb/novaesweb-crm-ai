import { redirect } from "next/navigation";
import ClientWorkspace from "@/components/crm/ClientWorkspace";

type ClientPageProps = {
  searchParams: Promise<{ tenant?: string | string[] }>;
};

export default async function ClientPage({ searchParams }: ClientPageProps) {
  const params = await searchParams;
  const tenant = typeof params.tenant === "string" ? params.tenant : "";
  if (tenant === "novaesweb") redirect("/admin?section=crm");
  return <ClientWorkspace initialTenant={tenant} />;
}
