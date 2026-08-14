import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "Veritable — Verifiable RWA Yield";
  const description = "AI-assisted evidence extraction with deterministic, challengeable settlement on BOT Chain.";
  return {
    metadataBase,
    title,
    description,
    openGraph: { title, description, type: "website", images: [{ url: "/og-v3.png", width: 1536, height: 1024, alt: "Veritable — Make real-world yield prove itself." }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og-v3.png"] },
  };
}

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
