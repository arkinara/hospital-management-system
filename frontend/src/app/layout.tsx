import type { Metadata } from "next";
import { Fira_Code, Lexend, Source_Sans_3 } from "next/font/google";
import { MockServiceWorker } from "@/components/MockServiceWorker";
import "../styles/tokens.css";
import "../styles/motion.css";
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

/**
 * Pre-hydration preference boot.
 *
 * Reads `hms-theme` / `hms-density` and mirrors them onto <html> before first
 * paint, so there is no flash of the wrong palette or density. Wrapped in
 * try/catch: when storage is unavailable the default theme renders instead of an
 * unstyled page.
 */
const prefsScript = `(function(){try{
var t=localStorage.getItem('hms-theme')||'system';
var d=localStorage.getItem('hms-density')||'comfortable';
var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var root=document.documentElement;
root.classList.toggle('dark',dark);
root.dataset.themePref=t;
var compact=d==='compact'&&window.innerWidth>=1024;
root.dataset.density=compact?'compact':'comfortable';
root.classList.toggle('density-compact',compact);
root.classList.toggle('density-comfortable',!compact);
}catch(e){document.documentElement.dataset.density='comfortable';}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: prefsScript }} />
      <body
        className={`${lexend.variable} ${sourceSans.variable} ${firaCode.variable} bg-background text-foreground antialiased`}
      >
        <MockServiceWorker />
        {children}
      </body>
    </html>
  );
}
