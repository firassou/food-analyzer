import type { Metadata, Viewport } from "next";
import { Figtree, Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { cookies, headers } from "next/headers";
import { I18nProvider } from "./lib/i18n/I18nProvider";
import { dirOf, isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "./lib/i18n/locales";
import { MESSAGES } from "./lib/i18n/messages";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// headings and big figures
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

// The Latin faces have no Arabic glyphs; this one is fetched only when it is needed.
// No metric fallback face: it leads the stack in Arabic (see globals.css), where a
// local-Arial fallback would add nothing.
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  preload: false,
  adjustFontFallback: false,
});

/** a language picked by hand wins; otherwise follow the device (Accept-Language) */
async function requestLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return matchLocale((await headers()).get("accept-language"));
}

export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = MESSAGES[await requestLocale()].meta;
  return { title, description, appleWebApp: { capable: true, title: "Food Analyzer", statusBarStyle: "default" } };
}

export const viewport: Viewport = {
  // the page paints under the notch and the home indicator; the dock pads itself with safe-area insets
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1015" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await requestLocale();
  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={`${geistSans.variable} ${geistMono.variable} ${figtree.variable} ${plexArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
