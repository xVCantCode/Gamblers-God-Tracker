import { MatchInfo as RiotMatchInfo } from "../lib/riot-api";

export interface RiotId {
	gameName: string;
	tagLine: string;
}

export interface MatchResult {
	champion: string;
	placement: number;
	matchId: string;
	timestamp: number;
}

export interface ArenaProgress {
	firstPlaceChampions: string[]; // Legacy - keeping for backward compatibility
	wins: string[]; // Champions with 1st place finishes
	top4s: string[]; // Champions with top 4 finishes (1st-4th place)
	firstPlays: string[]; // Champions played for the first time
}

export type MatchInfo = RiotMatchInfo;
