import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NovaesWeb CRM AI | Dashboard",
  description: "Demonstração visual do futuro painel de atendimento e agentes de IA da NovaesWeb.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
