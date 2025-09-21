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
	// Store full history as requested (no trimming)
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

// =====================
// IndexedDB (MATCH_CACHE)
// =====================

// We store large match payloads in IndexedDB to avoid localStorage quota issues.
// Object store: "matches" with keyPath "id" and value { id: string, data: MatchInfo }

let dbPromise: Promise<IDBDatabase> | null = null;
let migrationPromise: Promise<void> | null = null;

function openDB(): Promise<IDBDatabase> {
	if (typeof window === "undefined") return Promise.reject(new Error("No window"));
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const req = indexedDB.open("arena-tracker", 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains("matches")) {
				db.createObjectStore("matches", { keyPath: "id" });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error || new Error("Failed to open IndexedDB"));
	});
	return dbPromise;
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>): Promise<T> {
	return openDB().then((db) => {
		return new Promise<T>((resolve, reject) => {
			const tx = db.transaction("matches", mode);
			const store = tx.objectStore("matches");
			fn(store)
				.then((res) => {
					tx.oncomplete = () => resolve(res);
					tx.onerror = () => reject(tx.error || new Error("TX failed"));
				})
				.catch(reject);
		});
	});
}

function reqToPromise<T = unknown>(req: IDBRequest<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		req.onsuccess = () => resolve(req.result as T);
		req.onerror = () => reject(req.error || new Error("IDB request failed"));
	});
}

async function ensureMigration() {
	if (typeof window === "undefined") return;
	if (migrationPromise) return migrationPromise;
	migrationPromise = (async () => {
		const legacy = localStorage.getItem(STORAGE_KEYS.MATCH_CACHE);
		if (!legacy) return;
		try {
			const parsed: Record<string, MatchInfo> = JSON.parse(legacy);
			if (parsed && typeof parsed === "object") {
				await withStore("readwrite", async (store) => {
					for (const [id, data] of Object.entries(parsed)) {
						const value = { id, data: slimMatchInfo(data) } as { id: string; data: MatchInfo };
						await reqToPromise(store.put(value));
					}
					return undefined as unknown as void;
				});
			}
		} catch {
			// ignore corrupt legacy data
		} finally {
			try { localStorage.removeItem(STORAGE_KEYS.MATCH_CACHE); } catch {}
		}
	})();
	return migrationPromise;
}

// Safely parse match cache from legacy localStorage (still used by backup migration only)
export function getMatchCache(): Record<string, MatchInfo> {
	if (typeof window === "undefined") return {};
	try {
		const stored = localStorage.getItem(STORAGE_KEYS.MATCH_CACHE);
		return stored ? JSON.parse(stored) : {};
	} catch {
		try { localStorage.removeItem(STORAGE_KEYS.MATCH_CACHE); } catch {}
		return {};
	}
}

// Build a minimal MatchInfo object keeping only fields required by getPlayerMatchResult
function slimMatchInfo(match: MatchInfo): MatchInfo {
	const participants = match.info.participants.map((p) => {
		const base: Record<string, unknown> = {
			puuid: (p as unknown as Record<string, unknown>)["puuid"],
			championName: (p as unknown as Record<string, unknown>)["championName"],
			placement: (p as unknown as Record<string, unknown>)["placement"],
		};
		const pobj = p as unknown as Record<string, unknown>;
		const augKeys = ["playerAugment1", "playerAugment2", "playerAugment3", "playerAugment4"] as const;
		for (const k of augKeys) {
			if (typeof pobj[k] === "number") base[k] = pobj[k] as number;
		}
		const maybeAug = pobj["augments"];
		if (Array.isArray(maybeAug)) {
			const nums = (maybeAug as unknown[]).filter((v): v is number => typeof v === "number");
			if (nums.length > 0) base["augments"] = nums;
		}
		for (const k of ["arenaScore", "score", "cherryScore"] as const) {
			if (typeof pobj[k] === "number") base[k] = pobj[k] as number;
		}
		return base;
	});
	const slim = { info: { gameCreation: match.info.gameCreation, participants } } as unknown as MatchInfo;
	return slim;
}


// New: IndexedDB-backed cache APIs
export async function cacheMatches(matches: Record<string, MatchInfo>) {
	if (typeof window === "undefined") return;
	await ensureMigration();
	// Slim down new payloads before storing
	const entries = Object.entries(matches).map(([id, info]) => ({ id, data: slimMatchInfo(info) }));
	await withStore("readwrite", async (store) => {
		for (const entry of entries) {
			await reqToPromise(store.put(entry));
		}
		return undefined as unknown as void;
	});
}

export async function getCachedMatches(matchIds: string[]): Promise<Record<string, MatchInfo>> {
	if (typeof window === "undefined") return {};
	await ensureMigration();
	const out: Record<string, MatchInfo> = {};
	await withStore("readonly", async (store) => {
		for (const id of matchIds) {
			const row = await reqToPromise<{ id: string; data: MatchInfo } | undefined>(store.get(id));
			if (row && row.data) out[id] = row.data;
		}
		return undefined as unknown as void;
	});
	return out;
}

export function clearMatchHistory() {
	if (typeof window === "undefined") return;
	localStorage.removeItem(STORAGE_KEYS.MATCH_HISTORY);
}

// Remove a list of match IDs from the match cache (IndexedDB)
export async function removeFromMatchCache(matchIds: string[]) {
	if (typeof window === "undefined") return;
	await ensureMigration();
	await withStore("readwrite", async (store) => {
		for (const id of matchIds) {
			await reqToPromise(store.delete(id));
		}
		return undefined as unknown as void;
	});
}

export function getFirstSeasonMatchId(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem(STORAGE_KEYS.FIRST_SEASON_MATCH);
}

export function setFirstSeasonMatchId(matchId: string) {
	if (typeof window === "undefined") return;
	localStorage.setItem(STORAGE_KEYS.FIRST_SEASON_MATCH, matchId);
}

export async function clearAllMatchData() {
	if (typeof window === "undefined") return;
	localStorage.removeItem(STORAGE_KEYS.MATCH_HISTORY);
	localStorage.removeItem(STORAGE_KEYS.ARENA_PROGRESS);
	localStorage.removeItem(STORAGE_KEYS.FIRST_SEASON_MATCH);
	// Clear IndexedDB match cache
	await ensureMigration();
	await withStore("readwrite", async (store) => {
		await reqToPromise(store.clear());
		return undefined as unknown as void;
	});
}

// Backup/Restore helpers
export type BackupData = {
	riotId: RiotId | null;
	matchHistory: MatchResult[];
	arenaProgress: ArenaProgress;
	matchCache: Record<string, MatchInfo>;
	firstSeasonMatchId: string | null;
};

export async function getBackupData(): Promise<BackupData> {
	if (typeof window === "undefined") {
		return {
			riotId: null,
			matchHistory: [],
			arenaProgress: { firstPlaceChampions: [], wins: [], top4s: [], firstPlays: [] },
			matchCache: {},
			firstSeasonMatchId: null,
		};
	}
	await ensureMigration();
	// Read all cached matches from IndexedDB
	const matchCache: Record<string, MatchInfo> = {};
	await withStore("readonly", async (store) => {
		const req = store.getAll() as IDBRequest<Array<{ id: string; data: MatchInfo }>>;
		const rows = await reqToPromise<Array<{ id: string; data: MatchInfo }>>(req);
		for (const r of rows) matchCache[r.id] = r.data;
		return undefined as unknown as void;
	});
	return {
		riotId: getRiotId(),
		matchHistory: getMatchHistory(),
		arenaProgress: getArenaProgress(),
		matchCache,
		firstSeasonMatchId: getFirstSeasonMatchId(),
	};
}

export async function restoreBackupData(backup: BackupData) {
	if (typeof window === "undefined") return;
	try {
		if (backup.riotId) setRiotId(backup.riotId);
		setMatchHistory(backup.matchHistory || []);
		if (backup.firstSeasonMatchId) {
			localStorage.setItem(
				STORAGE_KEYS.FIRST_SEASON_MATCH,
				backup.firstSeasonMatchId
			);
		} else {
			localStorage.removeItem(STORAGE_KEYS.FIRST_SEASON_MATCH);
		}
		// Write match cache to IndexedDB
		await ensureMigration();
		const pairs = Object.entries(backup.matchCache || {}).map(([id, data]) => ({ id, data: slimMatchInfo(data) }));
		await withStore("readwrite", async (store) => {
			for (const p of pairs) {
				await reqToPromise(store.put(p));
			}
			return undefined as unknown as void;
		});
		// Set progress directly; callers may still recompute from history if desired
		if (backup.arenaProgress) setArenaProgress(backup.arenaProgress);
	} catch (e) {
		console.error("Failed to restore backup:", e);
		throw e;
	}
}

export type { MatchInfo };
