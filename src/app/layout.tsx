import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProofPay",
  description: "Private work-proof checkout for Stellar invoice escrow"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
