import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TagTeamGPT — Plan in Chat. Build in Codex.",
  description:
    "A desktop-native Chat-to-Codex relay. Plan, execute, review, and keep the same goal moving.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="dark h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
