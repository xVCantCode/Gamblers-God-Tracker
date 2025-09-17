import { z } from "zod";
import { riotRateLimiter } from "./rate-limiter";

// Types
export const RiotAccountSchema = z.object({
	puuid: z.string(),
	gameName: z.string(),
	tagLine: z.string(),
});

export const RiotErrorSchema = z.object({
	status: z.object({
		status_code: z.number(),
		message: z.string(),
	}),
});

export type RiotAccount = z.infer<typeof RiotAccountSchema>;
export type RiotError = z.infer<typeof RiotErrorSchema>;

export const MatchParticipantSchema = z.object({
	puuid: z.string(),
	championName: z.string(),
	placement: z.number(),
});

export const MatchInfoSchema = z.object({
	info: z.object({
		gameCreation: z.number(),
		participants: z.array(MatchParticipantSchema),
	}),
});

export type MatchParticipant = z.infer<typeof MatchParticipantSchema>;
export type MatchInfo = z.infer<typeof MatchInfoSchema>;

// Server Actions
export async function getRiotAccount(gameName: string, tagLine: string): Promise<{
	data?: RiotAccount;
	error?: string | RiotError;
}> {
	let data: unknown;
	try {
		// Wait for rate limit compliance
		await riotRateLimiter.waitForRateLimit();
		
		const response = await fetch(
			`/api/riot?endpoint=account&gameName=${encodeURIComponent(
				gameName
			)}&tagLine=${encodeURIComponent(tagLine)}`
		);

		const contentType = response.headers.get("content-type") || "";

		if (!response.ok) {
			console.error("API Error (account):", { status: response.status });

			// Handle specific error cases first
			if (response.status === 401) {
				return { error: "API token expired or invalid. Please update your RIOT_API_TOKEN in .env.local" };
			}
			if (response.status === 403) {
				return { error: "API access forbidden. Check your API token permissions" };
			}
			if (response.status === 429) {
				return { error: "Rate limit exceeded. Please try again later" };
			}

			// Try to extract a meaningful error message without assuming JSON
			let message: string | undefined;
			try {
				if (contentType.includes("application/json")) {
					const err = await response.json();
					if (err && typeof err === "object") {
						if ("status" in (err as Record<string, unknown>)) {
							// possibly RiotError
							const parsed = RiotErrorSchema.safeParse(err);
							if (parsed.success) return { error: parsed.data };
						}
						if ("message" in (err as Record<string, unknown>)) {
							message = (err as { message?: string }).message;
						}
					}
				} else {
					const text = await response.text();
					message = text?.slice(0, 200);
				}
			} catch {
				// ignore parse errors and fall back to generic message
			}

			return { error: `API Error (${response.status}): ${message || "Unknown error"}` };
		}

		// For 2xx, ensure we got JSON; otherwise avoid JSON parse crash
		if (!contentType.includes("application/json")) {
			const text = await response.text();
			console.error("Unexpected non-JSON response for account:", text.slice(0, 200));
			return { error: "Unexpected response format from API (expected JSON)" };
		}

		data = await response.json();
		console.log("Raw Riot API response:", { status: response.status, data });

		return { data: RiotAccountSchema.parse(data) };
	} catch (error) {
		console.error("Error fetching Riot account:", error);
		if (error instanceof z.ZodError) {
			console.error("Zod validation error details:", error.errors);
			console.error("Raw API response data:", data);
		}
		return { error: "Failed to fetch Riot account" };
	}
}

export async function getMatchIds(puuid: string, count: number = 20, start: number = 0) {
	try {
		const result = await retryWithBackoff(async () => {
			// Wait for rate limit compliance with matchIds endpoint
			await riotRateLimiter.waitForRateLimit('matchIds');
			
			const response = await fetch(
				`/api/riot?endpoint=matchIds&puuid=${puuid}&count=${count}&start=${start}`
			);

			if (!response.ok) {
				if (response.status === 401) {
					throw new Error("API token expired or invalid. Please update your RIOT_API_TOKEN in .env.local");
				}
				if (response.status === 403) {
					throw new Error("API access forbidden. Check your API token permissions");
				}
				if (response.status === 429) {
					throw new Error("Rate limit exceeded. Please try again later");
				}
				
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
			return z.array(z.string()).parse(data);
		}, 3, 2000); // 3 retries with 2 second base delay
		
		return { data: result };
	} catch (error) {
		console.error("Error fetching match IDs:", error);
		return { error: "Failed to fetch match IDs" };
	}
}

// Helper function for exponential backoff retry
async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxRetries: number = 3,
	baseDelay: number = 1000
): Promise<T> {
	let lastError: Error;
	
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;
			
			// Check if it's a rate limit error (429)
			if (error instanceof Error && error.message.includes('429')) {
				if (attempt < maxRetries) {
					// Exponential backoff: baseDelay * 2^attempt
					const delay = baseDelay * Math.pow(2, attempt);
					console.log(`Rate limited (429), retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
					await new Promise(resolve => setTimeout(resolve, delay));
					continue;
				}
			}
			
			// For non-429 errors or if we've exhausted retries, throw immediately
			throw error;
		}
	}
	
	throw lastError!;
}

export async function getMatchInfo(matchId: string) {
	try {
		const result = await retryWithBackoff(async () => {
			// Wait for rate limit compliance
			await riotRateLimiter.waitForRateLimit();
			
			const response = await fetch(
				`/api/riot?endpoint=match&matchId=${encodeURIComponent(matchId)}`
			);

			if (!response.ok) {
				if (response.status === 401) {
					throw new Error("API token expired or invalid. Please update your RIOT_API_TOKEN in .env.local");
				}
				if (response.status === 403) {
					throw new Error("API access forbidden. Check your API token permissions");
				}
				if (response.status === 429) {
					throw new Error("Rate limit exceeded. Please try again later");
				}
				
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
			return MatchInfoSchema.parse(data);
		}, 3, 2000); // 3 retries with 2 second base delay
		
		return { data: result };
	} catch (error) {
		console.error("Error fetching match info:", error);
		return { error: "Failed to fetch match info" };
	}
}

// Helper function to get player's placement in a match
export function getPlayerMatchResult(
	matchInfo: MatchInfo,
	playerPuuid: string
) {
	console.log('🔍 Processing match info for player:', playerPuuid);
	console.log('📊 Match participants:', matchInfo.info.participants.length);
	
	const player = matchInfo.info.participants.find(
		(p: MatchParticipant) => p.puuid === playerPuuid
	);

	if (!player) {
		console.log('❌ Player not found in match participants');
		return null;
	}

	const result = {
		champion: player.championName,
		placement: player.placement,
		timestamp: matchInfo.info.gameCreation,
	};
	
	console.log('✅ Match result extracted:', result);
	return result;
}
