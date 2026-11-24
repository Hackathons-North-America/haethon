import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { PageWash } from "@/components/page-wash";
import { AppProviders } from "@/components/providers/app-providers";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hackathons North America",
  description: "Discover, track, and organize hackathons across North America.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} h-full bg-paper`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies a saved theme choice before first paint so the page never
            flashes the wrong theme. Without a saved choice it does nothing
            and the CSS follows the OS setting. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body
        className="min-h-full font-sans text-ink antialiased selection:bg-pine/25 selection:text-ink motion-safe:[&_*]:transition-[color,border-color,background-color,opacity] motion-safe:[&_*]:duration-[160ms] motion-safe:[&_*]:ease-out"
      >
        {/* The body has no background of its own: html's bg-paper paints the
            canvas, and an opaque body would hide the -z-10 PageWash. */}
        <PageWash />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
