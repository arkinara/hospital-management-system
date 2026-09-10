import type { Metadata } from "next";
import { Fira_Code, Lexend, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hospital MS",
  description: "Hospital management system — clinical operations console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-density="compact">
      <body
        className={`${lexend.variable} ${sourceSans.variable} ${firaCode.variable} bg-background text-foreground antialiased`}
      >
        {children}
      </body>
    </html>
  );
}