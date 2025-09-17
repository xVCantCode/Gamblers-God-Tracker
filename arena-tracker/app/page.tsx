import { Tabs } from "./components/tabs";
import { getImageTiles } from "./lib/images";
import { ExternalLink } from 'lucide-react';

export default async function Home() {
	const images = await getImageTiles();

	return (
		<div className="min-h-screen p-4">
			<div className="flex items-center justify-center gap-4 mb-8">
				<h1 className="text-3xl font-bold text-center">
				Gambler Arena Tracker
			</h1>
				<a
					href="https://op.gg/lol/summoners/eune/Gambler-Adict?queue_type=ARENA"
					target="_blank"
					rel="noopener noreferrer"
					className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
				>
					<ExternalLink className="w-6 h-6" />
				</a>
			</div>
			<Tabs images={images} />
		</div>
	);
}
