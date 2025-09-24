"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { MatchResult, MatchInfo } from "../types";
import {
	getRiotId,
	setRiotId,
	getMatchHistory,
	setMatchHistory,
	cacheMatches,
	getCachedMatches,
	setArenaProgress,
	clearMatchHistory,
	clearAllMatchData,
	getBackupData,
	restoreBackupData,
	// NEW: season boundary helpers
	getFirstSeasonMatchId,
	setFirstSeasonMatchId,
	removeFromMatchCache,
	// NEW: history scope helpers
	getHistoryScope,
	setHistoryScope,
	getHistoryLimit,
	setHistoryLimit,
} from "../lib/storage";
import {
	getRiotAccount,
	getMatchIds,
	getMatchInfo,
	getPlayerMatchResult,
} from "../lib/riot-api";
import { ImageTile } from "../lib/images";

const PLACEMENT_COLORS = {
	1: "bg-yellow-500 dark:bg-yellow-600",
	2: "bg-gray-400 dark:bg-gray-700",
	3: "bg-gray-400 dark:bg-gray-700",
	4: "bg-gray-400 dark:bg-gray-700",
	5: "bg-gray-400 dark:bg-gray-700",
	6: "bg-gray-400 dark:bg-gray-700",
	7: "bg-gray-400 dark:bg-gray-700",
	8: "bg-gray-400 dark:bg-gray-700",
} as const;

interface MatchHistoryProps {
	images: ImageTile[];
	// Optional champion filter to restrict displayed matches
	filterChampion?: string;
	// Optional callback to clear the champion filter
	onClearChampionFilter?: () => void;
}

export function MatchHistory({ images, filterChampion, onClearChampionFilter }: MatchHistoryProps) {
	const [gameName, setGameName] = useState("Gambler");
	const [tagLine, setTagLine] = useState("Adict");
	const [tagLinePrefixActive, setTagLinePrefixActive] = useState(true);
	const [matchHistory, setMatchHistoryState] = useState<MatchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [autoRefresh, setAutoRefresh] = useState(true);
	const [matchCount, setMatchCount] = useState(100); // Riot's maximum per call for optimal pagination
	const [hasMoreMatches, setHasMoreMatches] = useState(true);
	const [startIndex, setStartIndex] = useState(0);
	// Define local type for history scope
	 type HistoryScope = "all" | "last_n";
	// NEW: persisted history limiting state
	const [historyScope, setHistoryScopeState] = useState<HistoryScope>("all");
	const [historyLimit, setHistoryLimitState] = useState<number>(100);
	// Track when initial local storage load has completed to avoid race with auto-refresh
	const [initialized, setInitialized] = useState(false);
	// Arena augment mapping (id -> { name, iconUrl }) from CommunityDragon
	// Arena augment mapping (id -> metadata) from CommunityDragon
	const [augmentMap, setAugmentMap] = useState<Record<number, { name?: string; desc?: string; icon: string; iconLarge?: string }>>({});
	// Load augment metadata (icon URLs, names, descriptions) from CommunityDragon once
	useEffect(() => {
		let cancelled = false;
		async function loadAugments() {
			try {
				const endpoints = [
					"https://raw.communitydragon.org/15.19/cdragon/arena/en_us.json",
				];
				let raw: unknown = null;
				let assetBase = "https://raw.communitydragon.org/latest";
				for (const url of endpoints) {
					try {
						const res = await fetch(url, { cache: "force-cache" });
						if (res.ok) {
							raw = await res.json();
							const idx = url.indexOf("/cdragon/");
							if (idx > -1) assetBase = url.substring(0, idx);
							break;
						}
					} catch {}
				}
				if (!raw) return;
				type CDragonAugment = {
					id?: number;
					AugmentId?: number;
					name?: string;
					Name?: string;
					description?: string;
					desc?: string;
					Desc?: string;
					tooltip?: string;
					iconPath?: string;
					icon?: string;
					Icon?: string;
					iconLargePath?: string;
					iconLarge?: string;
					IconLarge?: string;
				};
				let items: CDragonAugment[] = [];
				if (Array.isArray(raw)) {
					items = raw as CDragonAugment[];
				} else if (typeof raw === "object" && raw !== null) {
					const obj = raw as { augments?: unknown; Augments?: unknown };
					if (Array.isArray(obj.augments)) {
						items = obj.augments as CDragonAugment[];
					} else if (Array.isArray(obj.Augments)) {
						items = obj.Augments as CDragonAugment[];
					}
				}
				const map: Record<number, { name?: string; desc?: string; icon: string; iconLarge?: string }> = {};
				for (const it of items) {
					const id = typeof it?.id === "number" ? it.id : typeof it?.AugmentId === "number" ? it.AugmentId : undefined;
					const name = typeof it?.name === "string" ? it.name : typeof it?.Name === "string" ? it.Name : undefined;
					const desc = typeof it?.description === "string" ? it.description : typeof it?.desc === "string" ? it.desc : typeof it?.Desc === "string" ? it.Desc : typeof it?.tooltip === "string" ? it.tooltip : undefined;
					const iconRel = typeof it?.iconPath === "string" ? it.iconPath : typeof it?.icon === "string" ? it.icon : typeof it?.Icon === "string" ? it.Icon : undefined;
					const iconLargeRel = typeof it?.iconLargePath === "string" ? it.iconLargePath : typeof it?.iconLarge === "string" ? it.iconLarge : typeof it?.IconLarge === "string" ? it.IconLarge : undefined;
					if (typeof id === "number" && (iconRel || iconLargeRel)) {
						const normalized = iconRel ? iconRel.replace(/\\/g, "/") : undefined;
						let cleaned = normalized ? (normalized.startsWith("/") ? normalized : `/${normalized}`) : undefined;
						// CommunityDragon binary assets are under /game; icon paths come as /assets/... so prefix when needed
						if (cleaned && !cleaned.startsWith("/game/") && cleaned.startsWith("/assets/")) cleaned = `/game${cleaned}`;
						const largeNormalized = iconLargeRel ? iconLargeRel.replace(/\\/g, "/") : undefined;
						let largeCleaned = largeNormalized ? (largeNormalized.startsWith("/") ? largeNormalized : `/${largeNormalized}`) : undefined;
						if (largeCleaned && !largeCleaned.startsWith("/game/") && largeCleaned.startsWith("/assets/")) largeCleaned = `/game${largeCleaned}`;
						const smallUrl = cleaned ? `${assetBase}${cleaned}` : undefined;
						const largeUrl = largeCleaned ? `${assetBase}${largeCleaned}` : undefined;
						map[id] = { name, desc, icon: smallUrl ?? largeUrl ?? "", iconLarge: largeUrl };
					}
				}
				if (!cancelled) setAugmentMap(map);
			} catch {}
		}

		loadAugments();
		return () => { cancelled = true; };
	}, []);
	const getAugmentIconUrl = useCallback((id: number) => augmentMap[id]?.iconLarge || augmentMap[id]?.icon, [augmentMap]);
	const getAugmentName = useCallback((id: number) => augmentMap[id]?.name || `Augment ${id}`,[augmentMap]);
	const getAugmentDesc = useCallback((id: number) => augmentMap[id]?.desc,[augmentMap]);
	useEffect(() => {
		const storedRiotId = getRiotId();
		if (storedRiotId) {
			setGameName(storedRiotId.gameName);
			setTagLine(storedRiotId.tagLine);
			setTagLinePrefixActive(Boolean(storedRiotId.tagLine));
		}
		const existing = getMatchHistory();
		setMatchHistoryState(existing);
		// Ensure pagination continues from stored history size
		setStartIndex(existing.length);
		// Load persisted history settings
		try {
			const scope = getHistoryScope();
			const limit = getHistoryLimit();
			setHistoryScopeState(scope);
			setHistoryLimitState(limit);
		} catch {}
		setInitialized(true);
	}, []);

	// Provide function to rebuild arena progress from history (hoisted)
	const rebuildArenaProgressFromHistory = useCallback((allMatches: MatchResult[]) => {
	  // Respect a season cutoff if set
	  const seasonStartId = getFirstSeasonMatchId();
	  let matchesToCount = allMatches;
	  if (seasonStartId) {
	    const idx = allMatches.findIndex(m => m.matchId === seasonStartId);
	    if (idx >= 0) {
	      matchesToCount = allMatches.slice(0, idx + 1);
	    }
	  }
	
	  // Apply history scope limiting (All time vs Last N games)
	  if (historyScope === "last_n") {
	    const n = Math.max(1, Math.min(500, Number(historyLimit) || 100));
	    matchesToCount = matchesToCount.slice(0, n);
	  }

	  const championsPlayed = new Set<string>();
	  const championsWithWins = new Set<string>();
	  const championsWithTop4s = new Set<string>();

	  matchesToCount.forEach(match => {
	    championsPlayed.add(match.champion);
	    if (match.placement === 1) championsWithWins.add(match.champion);
	    if (match.placement <= 4) championsWithTop4s.add(match.champion);
	  });

	  const newProgress = {
	    firstPlays: Array.from(championsPlayed),
	    wins: Array.from(championsWithWins),
	    top4s: Array.from(championsWithTop4s),
	    firstPlaceChampions: Array.from(championsWithWins),
	  };

	  setArenaProgress(newProgress);
	}, [historyScope, historyLimit]);

	const handleUpdate = useCallback(async (loadMore: boolean = false) => {
		if (!gameName || !tagLine) {
			setError("Please enter both game name and tag line");
			return;
		}

		if (loadMore) {
			setIsLoadingMore(true);
		} else {
			setIsLoading(true);
			// Do not reset pagination or history; we’re doing additive update
		}
		setError(null);

		try {
			const account = await getRiotAccount(gameName, tagLine);
			if (account.error) {
				setError(
					typeof account.error === "string"
						? account.error
						: account.error.status.message
				);
				return;
			}

			if (!account.data) {
				setError("No account data received");
				return;
			}

			const accountData = account.data; // non-undefined alias for TS

			const newRiotId = {
				gameName: accountData.gameName,
				tagLine: accountData.tagLine,
			};
			setRiotId(newRiotId);

			// Debug pagination parameters
			const currentStart = loadMore ? startIndex : 0;
			console.log('🔍 Pagination Debug:', {
				loadMore,
				startIndex,
				currentStart,
				matchCount
			});

			const matchIds = await getMatchIds(
				accountData.puuid,
				matchCount,
				currentStart // start index for pagination
			);
			// Rate limit: stay under 20 req/sec
			await new Promise(res => setTimeout(res, 1200));
			
			if ("error" in matchIds) {
				setError(matchIds.error || "Failed to fetch match IDs");
				return;
			}

			if (!matchIds.data || matchIds.data.length === 0) {
				if (loadMore) {
					setHasMoreMatches(false);
					return;
				} else {
					setError("No match IDs received");
					return;
				}
			}

			// Process matches in batches - rate limiter handles timing
			const BATCH_SIZE = 15; // Optimized for large datasets while respecting rate limits
			const newHistory: (MatchResult & { isNewMatch: boolean })[] = [];
			const totalMatches = matchIds.data.length;
			let processedMatches = 0;
			
			console.log(`🎯 Processing ${matchIds.data.length} match IDs:`, matchIds.data);

			for (let i = 0; i < matchIds.data.length; i += BATCH_SIZE) {
				const batch = matchIds.data.slice(i, i + BATCH_SIZE);
				const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
				const totalBatches = Math.ceil(totalMatches / BATCH_SIZE);
				
				// Update progress for large datasets
				if (totalMatches > 50) {
					setStatus(`Processing batch ${batchNumber}/${totalBatches} (${processedMatches}/${totalMatches} matches)`);
				}
				
				// Check cache for entire batch first
				const cachedMatches = await getCachedMatches(batch);
				const uncachedMatchIds = batch.filter(id => !cachedMatches[id]);
				
				// Process cached matches immediately
				const cachedResults: (MatchResult & { isNewMatch: boolean })[] = [];
				for (const [matchId, matchInfo] of Object.entries(cachedMatches)) {
					const result = getPlayerMatchResult(matchInfo, accountData.puuid);
					if (result) {
						cachedResults.push({ ...result, matchId, isNewMatch: false });
					}
				}
				
				// Only fetch uncached matches from API
                const newMatchesCache: Record<string, MatchInfo> = {};
                const batchPromises: Promise<(MatchResult & { matchId: string; isNewMatch: boolean }) | null>[] = uncachedMatchIds.map(async (matchId) => {
                    // Fetch from API
                    const matchInfo = await getMatchInfo(matchId);
                    if ("error" in matchInfo || !matchInfo.data) return null;

                    // Store for batch caching
                    newMatchesCache[matchId] = matchInfo.data;

                    const result = getPlayerMatchResult(
                        matchInfo.data,
                        accountData.puuid
                    );
                    if (result) {
                        return {
                            ...result,
                            matchId,
                            isNewMatch: true,
                        };
                    }
                    return null;
                });

                const batchResults = await Promise.all(batchPromises);
                const validNewResults = batchResults.filter(
                    (result): result is MatchResult & { matchId: string; isNewMatch: boolean } =>
                        result !== null
                );
				
				// Batch cache new matches for better performance
				if (Object.keys(newMatchesCache).length > 0) {
					await cacheMatches(newMatchesCache);
				}
				
				// Combine cached and new results
				newHistory.push(...cachedResults, ...validNewResults);
				processedMatches += batch.length;

				// Rate limit: avoid crossing 100 req/2min
				await new Promise(res => setTimeout(res, 1500));
			}

			// Update match history based on whether we're loading more or refreshing
			let updatedHistory: MatchResult[];
			if (loadMore) {
				// Append new matches to existing history, filtering out duplicates
				const existingMatchIds = new Set(matchHistory.map(m => m.matchId));
				const uniqueNewMatches = newHistory.filter(m => !existingMatchIds.has(m.matchId));
				updatedHistory = [...matchHistory, ...uniqueNewMatches];
			} else {
				// Additively prepend new unique latest matches; keep existing history intact
				const existingMatchIds = new Set(matchHistory.map(m => m.matchId));
				const newUnique = newHistory.filter(m => !existingMatchIds.has(m.matchId));
				updatedHistory = [...newUnique, ...matchHistory];
			}

			setMatchHistoryState(updatedHistory);
			setMatchHistory(updatedHistory);

			// Update start index for next pagination
			if (loadMore) {
				setStartIndex(startIndex + matchIds.data.length);
			} else {
				// we prepended, keep pagination consistent by moving the window forward
				const existingIds = new Set(matchHistory.map(m => m.matchId));
				const newUniqueCount = newHistory.filter(m => !existingIds.has(m.matchId)).length;
				if (newUniqueCount > 0) {
					setStartIndex(prev => prev + newUniqueCount);
				}
			}

			// Check if we got fewer match IDs than requested (only relevant for pagination)
			if (loadMore && matchIds.data.length < matchCount) {
				setHasMoreMatches(false);
			}

			// Rebuild arena progress from ALL matches (not just new ones)
			rebuildArenaProgressFromHistory(updatedHistory);
		} catch (error) {
			console.error("Failed to update match history:", error);
			setError("Failed to update match history");
		} finally {
			setIsLoading(false);
			setIsLoadingMore(false);
		}
	}, [gameName, tagLine, matchCount, startIndex, matchHistory, rebuildArenaProgressFromHistory]);

	// Auto-load data for Gambler#Adict on first visit
	useEffect(() => {
		const hasData = getMatchHistory().length > 0;
		if (!hasData && gameName === "Gambler" && tagLine === "Adict") {
			setTimeout(() => handleUpdate(), 1000);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gameName, tagLine]);

	// Auto-refresh effect
	useEffect(() => {
		// Run an immediate refresh when auto-refresh is enabled so we don’t wait up to 5 minutes
		if (autoRefresh && initialized) {
			handleAutoRefreshLatest();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoRefresh, initialized]);

	// Auto-refresh interval effect (every 5 minutes)
	useEffect(() => {
		if (!autoRefresh || !initialized) return;
		const interval = setInterval(() => {
			handleAutoRefreshLatest();
		}, 5 * 60 * 1000);
		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoRefresh, initialized]);

	// Add missing auto-refresh implementation
	const handleAutoRefreshLatest = useCallback(async () => {
	  if (!gameName || !tagLine) return;
	  try {
	    const account = await getRiotAccount(gameName, tagLine);
	    if (account.error) {
	      console.warn("Auto-refresh skipped:", account.error);
	      return;
	    }
	    if (!account.data) return;
	    const accountData = account.data;

	    const LIMIT = 30; // latest 30
	    const matchIds = await getMatchIds(accountData.puuid, LIMIT, 0);
	    if ("error" in matchIds || !matchIds.data || matchIds.data.length === 0) return;

	    // Determine what is actually new compared to the newest item we already have
	    const persisted = getMatchHistory();
	    const baseHistory = (persisted.length >= matchHistory.length) ? persisted : matchHistory;
	    const currentNewestId = baseHistory[0]?.matchId;
	    let idsToProcess = matchIds.data;
	    if (currentNewestId) {
	      const idx = idsToProcess.indexOf(currentNewestId);
	      if (idx === 0) {
	        setStatus("Auto-refresh: no new matches found.");
	        setHasMoreMatches(true);
	        return; // nothing new
	      }
	      if (idx > 0) {
	        idsToProcess = idsToProcess.slice(0, idx); // only the truly new ones
	      }
	    }
	    if (idsToProcess.length === 0) {
	      setStatus("Auto-refresh: no new matches found.");
	      setHasMoreMatches(true);
	      return;
	    }
 
	    const BATCH_SIZE = 15;
	    const results: MatchResult[] = [];
 
	    for (let i = 0; i < idsToProcess.length; i += BATCH_SIZE) {
	      const batch = idsToProcess.slice(i, i + BATCH_SIZE);
 
	      const cachedMatches = await getCachedMatches(batch);
	      const uncached = batch.filter(id => !cachedMatches[id]);
 
	      const cachedResults: MatchResult[] = [];
	      for (const [id, info] of Object.entries(cachedMatches)) {
	        const r = getPlayerMatchResult(info, accountData.puuid);
	        if (r) cachedResults.push({ ...r, matchId: id });
	      }
 
	      const newMatchesCache: Record<string, MatchInfo> = {};
	      const fetchedResults: MatchResult[] = [];
	      for (const id of uncached) {
        const info = await getMatchInfo(id);
        if ("error" in info || !info.data) continue;
        newMatchesCache[id] = info.data;
        const r = getPlayerMatchResult(info.data, accountData.puuid);
        if (r) fetchedResults.push({ ...r, matchId: id });
      }
 
      if (Object.keys(newMatchesCache).length > 0) {
        await cacheMatches(newMatchesCache);
      }
 
	      results.push(...cachedResults, ...fetchedResults);
	      // rate limit safety
	      await new Promise(res => setTimeout(res, 1500));
	    }
 
	    // Merge with the larger of in-memory state and persisted storage to avoid truncation
	    const base = (persisted.length >= matchHistory.length) ? persisted : matchHistory;
	    const existingIds = new Set(base.map(m => m.matchId));
	    // Only keep unique new ones
	    const newUnique = results.filter(m => !existingIds.has(m.matchId));
	    // Ensure correct order: newest first
	    newUnique.sort((a, b) => b.timestamp - a.timestamp);
 
	    if (newUnique.length === 0) {
	      setStatus(`Auto-refresh: no new matches found.`);
	      // Ensure the Load More control remains available after refresh
	      setHasMoreMatches(true);
	      return;
	    }
 
	    const updatedHistory = [...newUnique, ...base];
	    setMatchHistoryState(updatedHistory);
	    setMatchHistory(updatedHistory);
	    // Keep pagination consistent with what we have loaded
	    setStartIndex(prev => prev + newUnique.length);
	    rebuildArenaProgressFromHistory(updatedHistory);
	    setStatus(`Auto-refresh: added ${newUnique.length} new match(es).`);
	    // Keep Load More visible after auto-refresh
	    setHasMoreMatches(true);
	  } catch (e) {
	    console.error("Auto-refresh failed:", e);
	  }
	}, [gameName, tagLine, matchHistory, rebuildArenaProgressFromHistory]);

	// NEW: drop past games (start fresh from a selected match or the most recent by default)
	const handleDropPastGames = useCallback((cutoffMatchId?: string) => {
	  if (!matchHistory || matchHistory.length === 0) return;
	  const idx = cutoffMatchId
	    ? matchHistory.findIndex(m => m.matchId === cutoffMatchId)
	    : 0; // default to newest-first
	  if (idx < 0) return;
	
	  const confirmed = typeof window !== "undefined"
	    ? window.confirm("Drop all older games and track from this match onward? This will ignore older matches for progress and stop loading older matches.")
	    : true;
	  if (!confirmed) return;
	
	  // Mark the first-season/cutoff match and trim older items from local storage/cache
	  const cutoffId = matchHistory[idx].matchId;
	  try {
	    setFirstSeasonMatchId(cutoffId);
	  } catch {}
	  const removedIds = matchHistory.slice(idx + 1).map(m => m.matchId);
	  if (removedIds.length > 0) {
	     try { (async () => { await removeFromMatchCache(removedIds); })(); } catch {}
	  }
	  const trimmed = matchHistory.slice(0, idx + 1);
	  setMatchHistoryState(trimmed);
	  setMatchHistory(trimmed);
	  setHasMoreMatches(false);
	  rebuildArenaProgressFromHistory(trimmed);
	  setStatus(`Dropped ${removedIds.length} older match(es). Tracking from the selected match onward.`);
	}, [matchHistory, rebuildArenaProgressFromHistory]);
 	

 	// Build LeagueOfGraphs match URL using Riot match ID
 	const buildLeagueOfGraphsMatchUrl = useCallback((matchId: string) => {
 	  const [prefix, rest] = matchId.split("_");
 	  const regionMap: Record<string, string> = {
 	    EUN1: "eune",
 	    EUW1: "euw",
 	    NA1: "na",
 	    KR: "kr",
 	    BR1: "br",
 	    JP1: "jp",
 	    RU: "ru",
 	    TR1: "tr",
 	    OC1: "oce",
 	    LA1: "lan",
 	    LA2: "las",
 	  };
 	  const region = (prefix && regionMap[prefix]) ? regionMap[prefix] : (prefix ? prefix.toLowerCase() : "na");
 	  const id = rest || matchId;
 	  return `https://www.leagueofgraphs.com/match/${region}/${id}`;
 	}, []);
 
 	// Filter matches by champion if requested
 	const displayedMatches = filterChampion
 	  ? matchHistory.filter((m) => m.champion === filterChampion)
 	  : matchHistory;
 	
 	// Render UI
 	return (
 	  <div className="space-y-6">
 	    {/* Top controls */}
 	    <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
 	      <div className="flex-1">
 	        <label htmlFor="gameName" className="block text-sm font-medium mb-1">Game Name</label>
 	        <input
 	          type="text"
 	          id="gameName"
 	          value={gameName}
 	          onChange={(e) => setGameName(e.target.value)}
 	          className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
 	          placeholder="Enter game name"
 	        />
 	      </div>
 	      <div className="flex-1">
 	        <label htmlFor="tagLine" className="block text-sm font-medium mb-1">Tag Line</label>
 	        <div className="relative">
 	          <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${tagLinePrefixActive ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}`} aria-hidden="true">#</span>
 	          <input
 	            type="text"
 	            id="tagLine"
 	            value={tagLine}
 	            onChange={(e) => {
 	              const raw = e.target.value;
 	              setTagLinePrefixActive(raw.length > 0 || raw.includes("#"));
 	              const sanitized = raw.replaceAll("#", "");
 	              setTagLine(sanitized);
 	            }}
 	            className="w-full pl-7 pr-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
 	            placeholder="Enter tag line"
 	          />
 	        </div>
 	      </div>
 	      <div className="flex-shrink-0">
 	        <label htmlFor="matchCount" className="block text-sm font-medium mb-1">Matches</label>
 	        <input
 	          type="number"
 	          id="matchCount"
 	          value={matchCount}
 	          onChange={(e) => setMatchCount(Math.max(1, Math.min(200, parseInt(e.target.value) || 100)))}
 	          min={1}
 	          max={200}
 	          className="w-20 px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
 	          placeholder="100"
 	        />
 	      </div>
 	      {/* NEW: History scope controls */}
 	      <div className="flex items-end gap-2">
 	        <div>
 	          <label htmlFor="historyScope" className="block text-sm font-medium mb-1">Progress Scope</label>
 	          <select
 	            id="historyScope"
 	            value={historyScope}
 	            onChange={(e) => {
 	              const scope = (e.target.value as HistoryScope);
 	              setHistoryScopeState(scope);
 	              try { setHistoryScope(scope); } catch {}
 	              // Recompute immediately using the same history
 	              rebuildArenaProgressFromHistory(matchHistory);
 	            }}
 	            className="px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
 	          >
 	            <option value="all">All time</option>
 	            <option value="last_n">Last N games</option>
 	          </select>
 	        </div>
 	        <div className="flex-shrink-0">
 	          <label htmlFor="historyLimit" className="block text-sm font-medium mb-1">Count</label>
 	          <input
 	            type="number"
 	            id="historyLimit"
 	            value={historyLimit}
 	            onChange={(e) => {
 	              const val = Math.max(1, Math.min(500, parseInt(e.target.value) || 100));
 	              setHistoryLimitState(val);
 	              try { setHistoryLimit(val); } catch {}
 	              rebuildArenaProgressFromHistory(matchHistory);
 	            }}
 	            min={1}
 	            max={500}
 	            disabled={historyScope !== "last_n"}
 	            className="w-24 px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 disabled:opacity-50"
 	            placeholder="100"
 	          />
 	        </div>
 	      </div>
 	      <div className="flex gap-2">
 	        <button
 	          onClick={() => handleUpdate()}
 	          disabled={isLoading}
 	          className="h-[42px] px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
 	        >
 	          {isLoading ? "Updating..." : "Update"}
 	        </button>
 	        <button
 	          onClick={() => {
 	            clearMatchHistory();
 	            setMatchHistoryState([]);
 	            setHasMoreMatches(true);
 	            setStartIndex(0);
 	            setStatus("Match history cleared.");
 	          }}
 	          disabled={isLoading}
 	          className="h-[42px] px-4 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
 	          title="Clear match history only (preserves arena progress)"
 	        >
 	          Clear Matches
 	        </button>
 	        <button
 	          onClick={async () => {
 	            await clearAllMatchData();
 	            setMatchHistoryState([]);
 	            setHasMoreMatches(true);
 	            setStartIndex(0);
 	            setStatus("All data cleared.");
 	          }}
 	          disabled={isLoading}
 	          className="h-[42px] px-4 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
 	          title="Clear ALL data including arena progress"
 	        >
 	          Clear All
 	        </button>
 	      </div>
 	    </div>
 
 	    {error && (
 	      <div className="p-4 bg-red-100 text-red-700 rounded-md dark:bg-red-900 dark:text-red-100">{error}</div>
 	    )}
 	    {status && (
 	      <div className="p-4 bg-blue-100 text-blue-700 rounded-md dark:bg-blue-900 dark:text-blue-100">{status}</div>
 	    )}
 
 	    <div className="flex items-center gap-4">
 	      <label className="flex items-center gap-2">
 	        <input
 	          type="checkbox"
 	          checked={autoRefresh}
 	          onChange={(e) => setAutoRefresh(e.target.checked)}
 	          className="rounded"
 	        />
 	        <span className="text-sm">Auto-refresh (5 min)</span>
 	      </label>
 	      <button
 	        onClick={handleExportBackup}
 	        className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
 	        title="Download all current data (history, progress, cache)"
 	      >
 	        Export Backup
 	      </button>
 	      <label className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-md text-sm hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
 	        Import Backup
 	        <input
 	          type="file"
 	          accept="application/json"
 	          className="hidden"
 	          onChange={(e) => {
 	            const f = e.target.files?.[0];
 	            if (f) {
 	              handleImportBackup(f);
 	            }
 	          }}
 	        />
 	      </label>
 	    </div>
 
 	    <div className="space-y-4">
 	      <h2 className="text-xl font-semibold">
 	        Recent Matches
 	        <span className="text-sm font-normal text-gray-500 ml-2">({displayedMatches.length} matches)</span>
 	        {historyScope === "last_n" && (
 	          <span className="ml-2 px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200">
 	            Progress counts last {historyLimit}
 	          </span>
 	        )}
 	      </h2>
 	      {filterChampion && (
 	        <div className="flex items-center gap-2 text-sm">
 	          <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">Filter: {filterChampion}</span>
 	          {onClearChampionFilter && (
 	            <button
 	              onClick={() => onClearChampionFilter()}
 	              className="px-2 py-1 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
 	            >
 	              Clear filter
 	            </button>
 	          )}
 	        </div>
 	      )}
 	      <div className="grid gap-4">
 	        {displayedMatches.map((match) => (
 	          <div key={match.matchId} className={`p-4 border rounded-lg dark:border-gray-700 transition-colors ${match.placement === 1 ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800" : ""}`}>
 	            <div className="flex items-center gap-4">
 	              <div className="relative w-16 h-16 flex-shrink-0">
 	                {(() => {
 	                  const championImage = images.find((image) => image.name === match.champion);
 	                  return championImage?.src ? (
 	                    <Image src={championImage.src} alt={match.champion} fill priority className="object-cover rounded-lg" sizes="64px" />
 	                  ) : (
 	                    <div className="w-full h-full bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
 	                      {match.champion.slice(0, 3)}
 	                    </div>
 	                  );
 	                })()}
 	              </div>
 	              <div className="flex-1">
 	                <div className="flex items-center gap-2">
	                  <div className="font-medium text-lg">{match.champion}</div>
	                  <div className={`px-2 py-1 rounded-full text-white text-sm font-medium ${PLACEMENT_COLORS[match.placement as keyof typeof PLACEMENT_COLORS] || "bg-gray-500 dark:bg-gray-600"}`}>#{match.placement}</div>
	                  {typeof match.score === "number" && (
	                    <div className="ml-2 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs" title="Arena score">
	                      Score {match.score}
	                    </div>
	                  )}
	                </div>
	                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
	                  Match ID: {" "}
	                  <a
	                    href={buildLeagueOfGraphsMatchUrl(match.matchId)}
	                    target="_blank"
	                    rel="noopener noreferrer"
	                    className="underline text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
	                  >
	                    {match.matchId}
	                  </a>
	                </div>
	                {Array.isArray(match.augments) && match.augments.length > 0 && (
	                  <div className="mt-2">
	                    <div className="flex items-center gap-1">
	                      {match.augments.map((id, idx) => {
	                        const src = getAugmentIconUrl(id);
	                        const desc = getAugmentDesc(id);
	                        const title = desc ? `${getAugmentName(id)}\n\n${desc}` : getAugmentName(id);
	                        return src ? (
	                          <div key={`${match.matchId}-aug-${id}-${idx}`} className="relative w-6 h-6" title={title}>
	                            <Image src={src} alt={getAugmentName(id)} fill sizes="24px" className="object-contain rounded-sm" unoptimized />
	                          </div>
	                        ) : (
	                          <div key={`${match.matchId}-aug-${id}-${idx}`} className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded-sm" title={`Augment ${id}`}></div>
	                        );
	                      })}
	                    </div>
	                    {/* Removed textual augment names row for icons-only UI */}
	                  </div>
	                )}
 	              </div>
 	              <button
 	                onClick={() => handleDropPastGames(match.matchId)}
 	                className="ml-auto px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
 	                title="Set this match as season start and drop all older ones"
 	              >
 	                Season First
 	              </button>
 	            </div>
 	          </div>
 	        ))}
 	      </div>
 
 	      {hasMoreMatches && matchHistory.length > 0 && (
 	        <div className="flex justify-center mt-6">
 	          <button
 	            onClick={() => handleUpdate(true)}
 	            disabled={isLoadingMore}
 	            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
 	          >
 	            {isLoadingMore ? (
 	              <>
 	                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
 	                Loading...
 	              </>
 	            ) : (
 	              'Load More Matches'
 	            )}
 	          </button>
 	        </div>
 	      )}
 	    </div>
 	  </div>
 	);
}

export async function handleExportBackup() {
	try {
		const backup = await getBackupData();
		const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `arena-tracker-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		if (typeof window !== "undefined") {
			console.log("Backup downloaded.");
		}
	} catch (e) {
		console.error(e);
		if (typeof window !== "undefined") {
			alert("Failed to export backup");
		}
	}
}

export function handleImportBackup_OLD(file: File) {
	const reader = new FileReader();
  // reader.onload = () => { (old)
  reader.onload = async () => {
    try {
      const json = JSON.parse(String(reader.result || "{}"));
      // restoreBackupData(json); (old)
      await restoreBackupData(json);
      // Reload to ensure UI picks up restored data
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
      if (typeof window !== "undefined") {
        alert("Failed to import backup: invalid file");
      }
    }
  };
  reader.readAsText(file);
}

export function handleImportBackup(file: File) {
	const reader = new FileReader();
	reader.onload = async () => {
		try {
			const json = JSON.parse(String(reader.result || "{}"));
			await restoreBackupData(json);
			// Reload to ensure UI picks up restored data
			if (typeof window !== "undefined") {
				window.location.reload();
			}
		} catch (e) {
			console.error(e);
			if (typeof window !== "undefined") {
				alert("Failed to import backup: invalid file");
			}
		}
	};
	reader.readAsText(file);
}
