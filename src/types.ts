// Servers

export enum ServerType {
    PUBLIC = 1,
    PRIVATE = 2,
    RESEREVED = 3
};

// Roblox API

export type GameCreator = {
    id:               number,
    name:             string,
    type:             string,
    isRNVAccount:     boolean, // Luobu Real Name Verified
    hasVerifiedBadge: boolean
}

export interface GameDetailResponse {
    id:      number,
    name:    string,
    creator: GameCreator
}

export interface UniverseIdResponse {
    universeId:  number
}

export interface ThumbnailResponse {
    targetId: number,
    state:    string,
    imageUrl: string
}

// BloxstrapRPC

export type RichPresenceImage = {
    assetId?:   number,
    hoverText?: string,
    clear?:     boolean, // false
    reset?:     boolean  // false
}

export type RichPresence = {
    details?:    string,
    state?:      string,
    timeStart?:  number,
    timeEnd?:    number,
    smallImage?: RichPresenceImage
    largeImage?: RichPresenceImage
}

export type Message = {
    command: string,
    data:    RichPresence | any
}
