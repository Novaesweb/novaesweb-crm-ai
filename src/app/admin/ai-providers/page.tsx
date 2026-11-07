import { redirect } from "next/navigation";

export default function ProvidersRedirect() {
  redirect("/admin?section=providers");
}
