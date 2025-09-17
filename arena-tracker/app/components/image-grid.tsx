"use client";

import Image from "next/image";
import { ImageTile } from "../lib/images";
import { getArenaProgress, setArenaProgress, ARENA_PROGRESS_UPDATED_EVENT } from "../lib/storage";
import { useState, useEffect } from "react";
import { CheckCircle2, Circle, ArrowUpDown, ArrowDownUp, Trophy, Medal, Play } from "lucide-react";
import { ArenaProgress } from "../types";

interface ImageGridProps {
	images: ImageTile[];
	displayImages?: ImageTile[];
	// When provided, clicking a champion in "All Progress" will navigate to Match History with this champion filter
	onOpenChampionHistory?: (champion: string) => void;
}

type SortMode = "completion" | "alphabetical";
type SortDirection = "asc" | "desc";
type TrackingMode = "wins" | "top4s" | "firstPlays" | "all";

export function ImageGrid({ images, displayImages = images, onOpenChampionHistory }: ImageGridProps) {
	const [mounted, setMounted] = useState(false);
	const [progress, setProgress] = useState<ArenaProgress>({
		firstPlaceChampions: [],
		wins: [],
		top4s: [],
		firstPlays: []
	});
	const [sortMode, setSortMode] = useState<SortMode>("completion");
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
	const [trackingMode, setTrackingMode] = useState<TrackingMode>("all");

	useEffect(() => {
		setMounted(true);
		setProgress(getArenaProgress());
	}, []);

	// Listen for progress updates coming from other parts of the app (e.g., MatchHistory "Drop past games")
	useEffect(() => {
		const onProgressUpdated = () => {
			setProgress(getArenaProgress());
		};
		if (typeof window !== "undefined") {
			window.addEventListener(ARENA_PROGRESS_UPDATED_EVENT as unknown as string, onProgressUpdated as EventListener);
			return () => window.removeEventListener(ARENA_PROGRESS_UPDATED_EVENT as unknown as string, onProgressUpdated as EventListener);
		}
	}, []);

	const getCurrentTrackingList = () => {
		switch (trackingMode) {
			case "wins": return progress.wins;
			case "top4s": return progress.top4s;
			case "firstPlays": return progress.firstPlays;
			case "all": return progress.firstPlays; // Use firstPlays as base for "all" mode
			default: return progress.wins;
		}
	};

	const getChampionCompletionLevel = (championName: string) => {
		const hasFirstPlay = progress.firstPlays.includes(championName);
		const hasTop4 = progress.top4s.includes(championName);
		const hasWin = progress.wins.includes(championName);
		
		if (hasWin) return 3; // Highest level - has win
		if (hasTop4) return 2; // Medium level - has top 4
		if (hasFirstPlay) return 1; // Basic level - has first play
		return 0; // No progress
	};

	const completedCount = getCurrentTrackingList().length;
	const totalCount = images.length;
	const winsCount = progress.wins.length;
	const top4sCount = progress.top4s.length;
	const firstPlaysCount = progress.firstPlays.length;

	const toggleChampion = (championName: string) => {
		const currentList = getCurrentTrackingList();
		const isCurrentlyTracked = currentList.includes(championName);
		
		const newProgress = { ...progress };
		
		switch (trackingMode) {
			case "wins":
				newProgress.wins = isCurrentlyTracked
					? progress.wins.filter(name => name !== championName)
					: [...progress.wins, championName];
				break;
			case "top4s":
				newProgress.top4s = isCurrentlyTracked
					? progress.top4s.filter(name => name !== championName)
					: [...progress.top4s, championName];
				break;
			case "firstPlays":
				newProgress.firstPlays = isCurrentlyTracked
					? progress.firstPlays.filter(name => name !== championName)
					: [...progress.firstPlays, championName];
				break;
		}
		
		setProgress(newProgress);
		setArenaProgress(newProgress);
	};

	const sortedImages = [...displayImages].sort((a, b) => {
		if (sortMode === "completion") {
			if (trackingMode === "all") {
				// Sort by completion level in "all" mode
				const aLevel = getChampionCompletionLevel(a.name);
				const bLevel = getChampionCompletionLevel(b.name);
				
				if (aLevel !== bLevel) {
					return sortDirection === "asc"
						? aLevel - bLevel
						: bLevel - aLevel;
				}
			} else {
				// Original completion sorting for specific modes
				const currentList = getCurrentTrackingList();
				const aCompleted = currentList.includes(a.name);
				const bCompleted = currentList.includes(b.name);
				if (aCompleted !== bCompleted) {
					return sortDirection === "asc"
						? aCompleted
							? -1
							: 1
						: aCompleted
						? 1
						: -1;
				}
			}
			// If both are in the same group (both completed or both incomplete),
			// sort alphabetically by display name
			return a.displayName.localeCompare(b.displayName);
		}
		// For alphabetical mode, just sort by name
		return sortDirection === "asc"
			? a.displayName.localeCompare(b.displayName)
			: b.displayName.localeCompare(a.displayName);
	});

	if (!mounted) {
		return null;
	}

	return (
		<div className="space-y-6">
			<div className="space-y-2">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<h3 className="text-lg font-medium">Progress</h3>
					{trackingMode === "wins" && <Trophy className="w-5 h-5 text-yellow-500" />}
					{trackingMode === "top4s" && <Medal className="w-5 h-5 text-blue-500" />}
					{trackingMode === "firstPlays" && <Play className="w-5 h-5 text-green-500" />}
					{trackingMode === "all" && <CheckCircle2 className="w-5 h-5 text-purple-500" />}
				</div>
				{trackingMode === "all" ? (
					<div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
						<div className="flex items-center gap-4">
							<span className="flex items-center gap-1">
								<Play className="w-4 h-4 text-green-500" />
								{firstPlaysCount}/{totalCount}
							</span>
							<span className="flex items-center gap-1">
								<Medal className="w-4 h-4 text-blue-500" />
								{top4sCount}/{totalCount}
							</span>
							<span className="flex items-center gap-1">
								<Trophy className="w-4 h-4 text-yellow-500" />
								{winsCount}/{totalCount}
							</span>
						</div>
					</div>
				) : (
					<span className="text-sm text-gray-500 dark:text-gray-400">
						{completedCount} / {totalCount} champions
					</span>
				)}
			</div>
			{trackingMode === "all" ? (
				<div className="space-y-1">
					<div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
						<div className="h-full bg-green-500" style={{ width: `${(firstPlaysCount / totalCount) * 100}%` }} />
					</div>
					<div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
						<div className="absolute inset-0 flex">
							<div
								className="h-full bg-blue-500"
								style={{ width: `${(top4sCount / totalCount) * 100}%` }}
							/>
							<div
								className="h-full bg-yellow-500"
								style={{ width: `${(winsCount / totalCount) * 100}%` }}
							/>
						</div>
					</div>
				</div>
			) : (
				<div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
					<div
						className="h-full bg-blue-500"
						style={{
							width: `${(completedCount / totalCount) * 100}%`,
						}}
					/>
				</div>
			)}
		</div>

			<div className="flex items-center gap-2 flex-wrap">
				<select
				value={trackingMode}
				onChange={(e) => setTrackingMode(e.target.value as TrackingMode)}
				className="px-3 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
			>
				<option value="all">📊 All Progress</option>
				<option value="wins">🏆 Wins (1st Place)</option>
				<option value="top4s">🥉 Top 4 Finishes</option>
				<option value="firstPlays">▶️ First Plays</option>
			</select>
				<select
					value={sortMode}
					onChange={(e) => setSortMode(e.target.value as SortMode)}
					className="px-3 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
				>
					<option value="completion">Sort by Completion</option>
					<option value="alphabetical">Sort Alphabetically</option>
				</select>
				<button
					onClick={() =>
						setSortDirection((prev) =>
							prev === "asc" ? "desc" : "asc"
						)
					}
					className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
					title={
						sortDirection === "asc"
							? "Reverse order"
							: "Normal order"
					}
				>
					{sortDirection === "asc" ? (
						<ArrowUpDown className="w-5 h-5" />
					) : (
						<ArrowDownUp className="w-5 h-5" />
					)}
				</button>
			</div>

			<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
				{sortedImages.map((image) => {
					const isCompleted = getCurrentTrackingList().includes(
						image.name
					);
					const completionLevel = getChampionCompletionLevel(image.name);
					const hasFirstPlay = progress.firstPlays.includes(image.name);
					const hasTop4 = progress.top4s.includes(image.name);
					const hasWin = progress.wins.includes(image.name);
					
					return (
						<div
							key={image.name}
							className="group relative flex flex-col items-center"
						>
							<button
								onClick={() => {
									if (trackingMode === "all") {
										if (onOpenChampionHistory) onOpenChampionHistory(image.name);
									} else {
										toggleChampion(image.name);
									}
								}}
								className="relative w-full aspect-square mb-2 group"
							>
								<Image
									src={image.src}
									alt={image.displayName}
									fill
									priority
									className={`object-cover rounded-lg ${
										trackingMode === "all" 
											? (completionLevel > 0 ? "opacity-100" : "opacity-50")
											: (isCompleted ? "opacity-100" : "opacity-50")
										} group-hover:opacity-100`}
									sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
								/>

								<div className="absolute top-2 left-2 flex flex-col gap-1">
									<a
										href={`https://u.gg/lol/champions/arena/${image.name.toLowerCase()}-arena-build`}
										target="_blank"
										rel="noopener noreferrer"
										onClick={(e) => e.stopPropagation()}
										className="px-2 py-0.5 text-xs font-medium bg-blue-500/90 text-white rounded-full hover:bg-blue-600 transition-colors shadow-sm ring-1 ring-blue-600/50"
									>
										u.gg
									</a>
									<a
										href={`https://blitz.gg/lol/champions/${image.name}/arena`}
										target="_blank"
										rel="noopener noreferrer"
										onClick={(e) => e.stopPropagation()}
										className="px-2 py-0.5 text-xs font-medium bg-red-500/90 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm ring-1 ring-red-600/50"
									>
										blitz
									</a>
									<a
										href={`https://www.metasrc.com/lol/arena/build/${image.name.toLowerCase()}`}
										target="_blank"
										rel="noopener noreferrer"
										onClick={(e) => e.stopPropagation()}
										className="px-2 py-0.5 text-xs font-medium bg-gray-500/90 text-white rounded-full hover:bg-gray-600 transition-colors shadow-sm ring-1 ring-gray-600/50"
									>
										metasrc
									</a>
								</div>
								{trackingMode === "all" ? (
									<div className="absolute top-2 right-2 flex flex-col gap-1">
										{hasWin && (
											<div className="p-1 rounded-full bg-yellow-500/90 shadow-sm">
												<Trophy className="w-4 h-4 text-white" />
											</div>
										)}
										{hasTop4 && !hasWin && (
											<div className="p-1 rounded-full bg-blue-500/90 shadow-sm">
												<Medal className="w-4 h-4 text-white" />
											</div>
										)}
										{hasFirstPlay && !hasTop4 && !hasWin && (
											<div className="p-1 rounded-full bg-green-500/90 shadow-sm">
												<Play className="w-4 h-4 text-white" />
											</div>
										)}
									</div>
								) : (
									<div className="absolute top-2 right-2">
										{isCompleted ? (
											<CheckCircle2 className="w-5 h-5 text-green-500" />
										) : (
											<Circle className="w-5 h-5 text-gray-400" />
										)}
									</div>
								)}
							</button>
							<div className="text-center text-sm">{image.displayName}</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
