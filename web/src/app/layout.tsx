import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Controle de Gastos",
  description: "Controle financeiro pessoal",
};

// Aplica o tema salvo antes da primeira pintura para nao piscar claro/escuro.
const THEME_SCRIPT = `try{var t=localStorage.getItem("tema");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
