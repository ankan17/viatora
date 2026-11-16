import type { Metadata, Viewport } from "next";
import { Nunito, Nunito_Sans } from "next/font/google";
import "./globals.css";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["700"] });
const nunitoSans = Nunito_Sans({ variable: "--font-nunito-sans", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: { default: "Travel Planner", template: "%s · Travel Planner" },
  description: "Plan a trip together by chatting. One itinerary everyone can trust.",
  appleWebApp: { capable: true, title: "Travel Planner", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf3f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1418" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} ${nunitoSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
