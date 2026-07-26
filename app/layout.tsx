import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCS—RG",
  description: "Multi-Hazard Smart Campus Safety & Response Grid",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body>{children}</body>
    </html>
  );
}
