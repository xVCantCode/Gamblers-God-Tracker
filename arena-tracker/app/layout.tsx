import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PostHogProvider } from "./providers";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	metadataBase: new URL("https://www.arenagod.click"),
	title: {
		default: "Arena God Tracker",
		template: "%s | ArenaGod.click",
	},
	description:
		"Allows you to track your progress in achieving the Arena God title. Automatically tracks your wins in arena too.",
	openGraph: {
		title: "Arena God Tracker",
		description:
			"Allows you to track your progress in achieving the Arena God title. Automatically tracks your wins in arena too.",
		type: "website",
		url: "https://www.arenagod.click/",
		siteName: "ArenaGod.click",
		images: [
			{
				url: "https://www.arenagod.click/og-image.png",
				width: 1200,
				height: 630,
				type: "image/png",
				alt: "ArenaGod",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "Arena God Tracker",
		description:
			"Allows you to track your progress in achieving the Arena God title. Automatically tracks your wins in arena too.",
		images: ["https://www.arenagod.click/og-image.png"],
	},
	icons: {
		icon: "/favicon.ico",
	},
	alternates: {
		canonical: "/",
	},
	robots: {
		index: true,
		follow: true,
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark">
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<div className="min-h-screen flex flex-col">
					<main className="flex-1">
						<PostHogProvider>{children}</PostHogProvider>
					</main>
					<footer className="border-t border-gray-200 dark:border-gray-800 py-6 px-4 text-center text-xs text-gray-500 dark:text-gray-400">
						© 2025-2026 Arenagod.click. Arenagod.click is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc. League of Legends © Riot Games, Inc.
					</footer>
				</div>
			</body>
		</html>
	);
}
