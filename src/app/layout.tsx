
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OCR Comparison System",
  description: "OCR engine comparison application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
