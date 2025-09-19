import { NextRequest, NextResponse } from "next/server";

const RIOT_API_BASE = "https://europe.api.riotgames.com";

export async function GET(request: NextRequest) {
	const RIOT_TOKEN = process.env.RIOT_API_TOKEN;
	if (!RIOT_TOKEN) {
		return NextResponse.json(
			{ error: "RIOT_API_TOKEN environment variable is not set" },
			{ status: 401 }
		);
	}

	const headers = {
		"X-Riot-Token": RIOT_TOKEN,
	};

	const searchParams = request.nextUrl.searchParams;
	const endpoint = searchParams.get("endpoint");
	const gameName = searchParams.get("gameName");
	const tagLine = searchParams.get("tagLine");
	const puuid = searchParams.get("puuid");
	const matchId = searchParams.get("matchId");
	const count = searchParams.get("count") || "100";

	if (!endpoint) {
		return NextResponse.json(
			{ error: "Endpoint is required" },
			{ status: 400 }
		);
	}

	try {
		let url = "";
		switch (endpoint) {
			case "account":
				if (!gameName || !tagLine) {
					return NextResponse.json(
						{ error: "Game name and tag line are required" },
						{ status: 400 }
					);
				}
				url = `${RIOT_API_BASE}/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`;
				break;

			case "matches":
			case "matchIds":
				if (!puuid) {
					return NextResponse.json(
						{ error: "PUUID is required" },
						{ status: 400 }
					);
				}
				const start = searchParams.get("start") || "0";
				url = `${RIOT_API_BASE}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=1700&start=${start}&count=${count}`;

				// Debug pagination parameters
				console.log('🔍 API Pagination Debug:', {
					start,
					count,
					finalUrl: url
				});
				break;

			case "match":
				if (!matchId) {
					return NextResponse.json(
						{ error: "Match ID is required" },
						{ status: 400 }
					);
				}
				url = `${RIOT_API_BASE}/lol/match/v5/matches/${matchId}`;
				break;

			default:
				return NextResponse.json(
					{ error: "Invalid endpoint" },
					{ status: 400 }
				);
		}

		const response = await fetch(url, { headers });
		const data = await response.json();

		if (!response.ok) {
			console.error(`❌ Riot API Error (${response.status}):`, {
				url,
				response: data,
				status: response.status
			});
			return NextResponse.json(data, { status: response.status });
		}

		// Debug logging for match data
		if (endpoint === "match" && data.info && data.info.participants) {
			console.log(`🎮 Match ${matchId} - Participants:`, data.info.participants.length);
			console.log(`🏆 Sample participant:`, data.info.participants[0]);
		}
		
		// Debug logging for matches list
		if ((endpoint === "matches" || endpoint === "matchIds") && Array.isArray(data)) {
			console.log(`📋 Found ${data.length} Arena matches for PUUID`);
			console.log(`🎯 All ${data.length} match IDs:`, data);
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error("Error in Riot API route:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
