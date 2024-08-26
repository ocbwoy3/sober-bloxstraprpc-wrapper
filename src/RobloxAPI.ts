import { GameDetailResponse, ThumbnailResponse, UniverseIdResponse } from "./types";

let cachedUniverseIds: {[placeId: string]: number} = {}

export async function GetUniverseId(placeId: number): Promise<number> {
	if (cachedUniverseIds[placeId.toString()]) {
		return cachedUniverseIds[placeId.toString()]
	}
	let universeIdResponse: UniverseIdResponse = await (await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`)).json();
	cachedUniverseIds[placeId.toString()] = universeIdResponse.universeId
	return universeIdResponse.universeId
}

let cachedPlaceDetails: {[universeId: string]: GameDetailResponse} = {}

export async function GetPlaceDetails(universeId: number): Promise<GameDetailResponse> {
    if (cachedPlaceDetails[universeId.toString()]) {
        return cachedPlaceDetails[universeId.toString()]
    }
    let placeDetailsResponse: GameDetailResponse = (await (await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`)).json()).data[0];
    cachedPlaceDetails[universeId.toString()] = placeDetailsResponse
    return placeDetailsResponse
}

let cachedPlaceIcons: {[universeId: string]: string} = {}

export async function GetPlaceIcon(universeId: number): Promise<string> {
    if (cachedPlaceIcons[universeId.toString()]) {
        return cachedPlaceIcons[universeId.toString()]
    }
    let placeIconResponse: ThumbnailResponse = (await (await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`)).json()).data[0];
    cachedPlaceIcons[universeId.toString()] = placeIconResponse.imageUrl
    return placeIconResponse.imageUrl
}