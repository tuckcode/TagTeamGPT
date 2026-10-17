import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TagTeamGPT — Plan in Chat. Build in Codex.",
  description:
    "Make your Codex usage go further. Plan and review in Chat, keep Codex focused on edits and tests, and exchange compact handoffs.",
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
