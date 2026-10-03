import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Controle de Gastos",
  description: "Controle financeiro pessoal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.variable} antialiased`}>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
