import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";
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
      style={{ colorScheme: "light" }}
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-paper font-sans text-ink antialiased selection:bg-pine/25 selection:text-ink motion-safe:[&_*]:transition-[color,border-color,background-color,opacity] motion-safe:[&_*]:duration-[160ms] motion-safe:[&_*]:ease-out"
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
