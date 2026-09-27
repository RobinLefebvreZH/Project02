import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "ERC-3643 Platform",
  description: "ERC-3643 security tokens for Swiss real-world assets, with compliance rules derived from Swiss law.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-[860px] px-[18px] pt-[6vh] pb-24 sm:px-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
