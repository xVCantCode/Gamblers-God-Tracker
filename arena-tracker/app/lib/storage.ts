import { RiotId, MatchResult, ArenaProgress, MatchInfo } from "../types";

const STORAGE_KEYS = {
	RIOT_ID: "arena-god-riot-id",
	MATCH_HISTORY: "arena-god-match-history",
	ARENA_PROGRESS: "arena-god-progress",
	MATCH_CACHE: "arena-god-match-cache",
	FIRST_SEASON_MATCH: "arena-god-first-season-match",
	// New settings keys
	HISTORY_SCOPE: "arena-god-history-scope",
	HISTORY_LIMIT: "arena-god-history-limit",
} as const;

export const ARENA_PROGRESS_UPDATED_EVENT = "arena-progress-updated";

export type HistoryScope = "all" | "last_n";

export function getHistoryScope(): HistoryScope {
	if (typeof window === "undefined") return "all";
	const v = localStorage.getItem(STORAGE_KEYS.HISTORY_SCOPE);
	return v === "last_n" ? "last_n" : "all";
}

export function setHistoryScope(scope: HistoryScope) {
	if (typeof window === "undefined") return;
	localStorage.setItem(STORAGE_KEYS.HISTORY_SCOPE, scope);
}

export function getHistoryLimit(): number {
	if (typeof window === "undefined") return 100;
	const v = parseInt(localStorage.getItem(STORAGE_KEYS.HISTORY_LIMIT) || "100", 10);
	if (!Number.isFinite(v) || v <= 0) return 100;
	return Math.max(1, Math.min(500, v));
}

export function setHistoryLimit(limit: number) {
	if (typeof window === "undefined") return;
	const normalized = Math.max(1, Math.min(500, Number(limit) || 100));
	localStorage.setItem(STORAGE_KEYS.HISTORY_LIMIT, String(normalized));
}

export function getRiotId(): RiotId | null {
	if (typeof window === "undefined") return null;
	const stored = localStorage.getItem(STORAGE_KEYS.RIOT_ID);
	return stored ? JSON.parse(stored) : null;
}

export function setRiotId(riotId: RiotId) {
	if (typeof window === "undefined") return;
	localStorage.setItem(STORAGE_KEYS.RIOT_ID, JSON.stringify(riotId));
}

export function getMatchHistory(): MatchResult[] {
	if (typeof window === "undefined") return [];
	const stored = localStorage.getItem(STORAGE_KEYS.MATCH_HISTORY);
	return stored ? JSON.parse(stored) : [];
}

export function setMatchHistory(history: MatchResult[]) {
	if (typeof window === "undefined") return;
	localStorage.setItem(STORAGE_KEYS.MATCH_HISTORY, JSON.stringify(history));
}

export function getArenaProgress(): ArenaProgress {
	if (typeof window === "undefined") return { 
		firstPlaceChampions: [], 
		wins: [], 
		top4s: [], 
		firstPlays: [] 
	};
	const stored = localStorage.getItem(STORAGE_KEYS.ARENA_PROGRESS);
	if (stored) {
		const parsed = JSON.parse(stored);
		// Ensure backward compatibility by providing defaults for new fields
		return {
			firstPlaceChampions: parsed.firstPlaceChampions || [],
			wins: parsed.wins || parsed.firstPlaceChampions || [], // Migrate legacy data
			top4s: parsed.top4s || [],
			firstPlays: parsed.firstPlays || []
		};
	}
	return { firstPlaceChampions: [], wins: [], top4s: [], firstPlays: [] };
}

export function setArenaProgress(progress: ArenaProgress) {
	if (typeof window === "undefined") return;
	localStorage.setItem(STORAGE_KEYS.ARENA_PROGRESS, JSON.stringify(progress));
	// Notify any listeners (e.g., ImageGrid) that progress changed
	try {
		window.dispatchEvent(new CustomEvent(ARENA_PROGRESS_UPDATED_EVENT, { detail: progress }));
	} catch {}
}

export function getMatchCache(): Record<string, MatchInfo> {
	if (typeof window === "undefined") return {};
	const stored = localStorage.getItem(STORAGE_KEYS.MATCH_CACHE);
	return stored ? JSON.parse(stored) : {};
}

export function cacheMatches(matches: Record<string, MatchInfo>) {
	if (typeof window === "undefined") return;
	const current = getMatchCache();
	const updated = { ...current, ...matches };
	localStorage.setItem(STORAGE_KEYS.MATCH_CACHE, JSON.stringify(updated));
}

export function getCachedMatches(matchIds: string[]): Record<string, MatchInfo> {
	const cache = getMatchCache();
	const result: Record<string, MatchInfo> = {};
	for (const id of matchIds) {
		if (cache[id]) result[id] = cache[id];
	}
	return result;
}

export function clearMatchHistory() {
	if (typeof window === "undefined") return;
	localStorage.removeItem(STORAGE_KEYS.MATCH_HISTORY);
}

// New helper: remove a list of match IDs from the match cache
export function removeFromMatchCache(matchIds: string[]) {
	if (typeof window === "undefined") return;
	const cache = getMatchCache();
	let changed = false;
	for (const id of matchIds) {
		if (id in cache) {
			delete cache[id];
			changed = true;
		}
	}
	if (changed) {
		localStorage.setItem(STORAGE_KEYS.MATCH_CACHE, JSON.stringify(cache));
	}
}

export function getFirstSeasonMatchId(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem(STORAGE_KEYS.FIRST_SEASON_MATCH);
}

export function setFirstSeasonMatchId(matchId: string) {
	if (typeof window === "undefined") return;
	localStorage.setItem(STORAGE_KEYS.FIRST_SEASON_MATCH, matchId);
}

export function clearAllMatchData() {
	if (typeof window === "undefined") return;
	localStorage.removeItem(STORAGE_KEYS.MATCH_HISTORY);
	localStorage.removeItem(STORAGE_KEYS.MATCH_CACHE);
	localStorage.removeItem(STORAGE_KEYS.ARENA_PROGRESS);
	localStorage.removeItem(STORAGE_KEYS.FIRST_SEASON_MATCH);
}

// Backup/Restore helpers
export type BackupData = {
	riotId: RiotId | null;
	matchHistory: MatchResult[];
	arenaProgress: ArenaProgress;
	matchCache: Record<string, MatchInfo>;
	firstSeasonMatchId: string | null;
};

export function getBackupData(): BackupData {
	if (typeof window === "undefined") {
		return {
			riotId: null,
			matchHistory: [],
			arenaProgress: { firstPlaceChampions: [], wins: [], top4s: [], firstPlays: [] },
			matchCache: {},
			firstSeasonMatchId: null,
		};
	}
	return {
		riotId: getRiotId(),
		matchHistory: getMatchHistory(),
		arenaProgress: getArenaProgress(),
		matchCache: getMatchCache(),
		firstSeasonMatchId: getFirstSeasonMatchId(),
	};
}

export function restoreBackupData(backup: BackupData) {
	if (typeof window === "undefined") return;
	try {
		if (backup.riotId) setRiotId(backup.riotId);
		setMatchHistory(backup.matchHistory || []);
		localStorage.setItem(
			STORAGE_KEYS.MATCH_CACHE,
			JSON.stringify(backup.matchCache || {})
		);
		if (backup.firstSeasonMatchId) {
			localStorage.setItem(
				STORAGE_KEYS.FIRST_SEASON_MATCH,
				backup.firstSeasonMatchId
			);
		} else {
			localStorage.removeItem(STORAGE_KEYS.FIRST_SEASON_MATCH);
		}
		// Set progress directly; callers may still recompute from history if desired
		if (backup.arenaProgress) setArenaProgress(backup.arenaProgress);
	} catch (e) {
		console.error("Failed to restore backup:", e);
		throw e;
	}
}

export type { MatchInfo };
