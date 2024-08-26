import { ActivityWatcher } from "./ActivityWatcher";
import * as constants from "./constants";
import { GameDetailResponse, RichPresence, ServerType, UniverseIdResponse } from "./types";
import { GetPlaceDetails, GetPlaceIcon, GetUniverseId } from "./RobloxAPI";
import rpc, { Presence } from "discord-rpc";

export class BloxstrapRPC {
	private aw: ActivityWatcher | undefined;
	public rp: rpc.Client | undefined;
	private _timeStartedUniverse: number = 0;
	private _currentUniverseId: number = 0;
	private _stashedRPCMessage: RichPresence|undefined;

	constructor(aw: ActivityWatcher) {
		this.aw = aw;
		this.rp = new rpc.Client({transport:'ipc'})
		aw.BloxstrapRPCEvent.on("Message",(a)=>{
			// console.debug("BloxstrapRPC!!!!!!!!!!!!",a)
			try {
				this.setStashedMessage(a)
			} catch {}
		})
		this.rp.login({ clientId: constants.DISCORD_APPID }).catch(console.error)
	};

	public async setStashedMessage(rp: RichPresence) {
		if (!rp) {
			this._stashedRPCMessage = undefined;
			return;
		};

		if (!this._stashedRPCMessage) this._stashedRPCMessage = {}
		if (rp.timeStart) this._stashedRPCMessage.timeStart = ((<any>rp.timeStart === 0) ? undefined : rp.timeStart);
		if (rp.timeEnd) this._stashedRPCMessage.timeStart = ((<any>rp.timeEnd === 0) ? undefined : rp.timeEnd);
		if (rp.details) this._stashedRPCMessage.details = ((rp.details.length === 0) ? undefined : rp.details);
		if (rp.state) this._stashedRPCMessage.state = ((rp.state.length === 0) ? undefined : rp.state);

		if (rp.largeImage) {
			if (!this._stashedRPCMessage.largeImage) this._stashedRPCMessage.largeImage = {};
			if (rp.largeImage.assetId) this._stashedRPCMessage.largeImage.assetId = rp.largeImage.assetId;
			if (rp.largeImage.hoverText) this._stashedRPCMessage.largeImage.hoverText = rp.largeImage.hoverText;
			if (rp.largeImage.clear) this._stashedRPCMessage.largeImage.hoverText = undefined;
			if (rp.largeImage.reset) this._stashedRPCMessage.largeImage = {};
		};
		if (rp.smallImage) {
			if (!this._stashedRPCMessage.smallImage) this._stashedRPCMessage.smallImage = {};
			if (rp.smallImage.assetId) this._stashedRPCMessage.smallImage.assetId = rp.smallImage.assetId;
			if (rp.smallImage.hoverText) this._stashedRPCMessage.smallImage.hoverText = rp.smallImage.hoverText;
			if (rp.smallImage.clear) this._stashedRPCMessage.smallImage.hoverText = undefined;
			if (rp.smallImage.reset) this._stashedRPCMessage.smallImage = {};
		};
	}

	public async updateRichPresence() {
		if (!this.aw) return;
		if (!this.rp) return;

		if (this.aw.ActivityPlaceId === 0) {
			this._currentUniverseId = 0;
			this._stashedRPCMessage = undefined;
			try {
				this.rp.setActivity({},1)
			} catch {};
			return;
		}

		let universeId = 0;
		try {
			universeId = await GetUniverseId(this.aw.ActivityPlaceId);
		} catch {
			console.log("[BloxstrapRPC]", `Could not get Universe ID! PlaceId: ${this.aw.ActivityPlaceId}`);
			return false;
		}

		if (universeId != this._currentUniverseId) {
			this._timeStartedUniverse = Math.floor(Date.now()/1000);
		}

		//if (this._timeStartedUniverse === 0 || !this.aw.ActivityIsTeleport || universeId != this._currentUniverseId) this._timeStartedUniverse = Math.floor(Date.now()/1000);

		this._currentUniverseId = universeId;

		let universeDetails: GameDetailResponse|undefined;
		try {
			universeDetails = (await GetPlaceDetails(universeId)) as GameDetailResponse;
		} catch {
			console.log("[BloxstrapRPC]", `Could not get Universe details! PlaceId: ${this.aw.ActivityPlaceId} UniverseId: ${universeId}`);
			return false;
		}

		if (universeDetails.name.length < 2) universeDetails.name = `${universeDetails.name}\xE2\xE2\xE2`;

		let thumbnailIcon: string|undefined;
		try {
			thumbnailIcon = (await GetPlaceIcon(universeId)) as string;
		} catch {
			console.log("[BloxstrapRPC]", `Could not get Universe icon! PlaceId: ${this.aw.ActivityPlaceId} UniverseId: ${universeId}`);
			return false;
		}

		let status = (constants.LANG.ServerType_Public.replace('CREATOR',universeDetails.creator.name)) + (universeDetails.creator.hasVerifiedBadge ? constants.LANG.Activity_VerifiedIcon : "");
		switch (this.aw.ActivityServerType) {
			case ServerType.PRIVATE:
				status = constants.LANG.ServerType_Private;
				break;
			case ServerType.RESEREVED:
				status = constants.LANG.ServerType_Reserved;
				break;
			default:
				break;
		};

		try {
			let rpc: Presence = {
				details: (this._stashedRPCMessage?.details ? this._stashedRPCMessage.details : (constants.LANG.Activity_Playing.replace('GAME',universeDetails.name))),
				state: (this._stashedRPCMessage?.state ? this._stashedRPCMessage.state : status),
				startTimestamp: this._stashedRPCMessage?.timeStart || this._timeStartedUniverse,
				endTimestamp: this._stashedRPCMessage?.timeEnd,
				largeImageKey: (this._stashedRPCMessage?.largeImage?.assetId ? `https://assetdelivery.roblox.com/v1/asset/?id=${this._stashedRPCMessage.largeImage.assetId}` : thumbnailIcon),
				largeImageText: this._stashedRPCMessage?.largeImage?.hoverText,
				smallImageKey: (this._stashedRPCMessage?.smallImage?.assetId ? `https://assetdelivery.roblox.com/v1/asset/?id=${this._stashedRPCMessage.smallImage.assetId}` : constants.SMALL_IMAGE_KEY),
				smallImageText: this._stashedRPCMessage?.smallImage?.hoverText,
				buttons: [
					{label: "See game page", url: `https://www.roblox.com/games/${this.aw.ActivityPlaceId}`}
				]
			}
			if (this.aw.ActivityServerType === ServerType.PUBLIC) {
				rpc.buttons?.push(
					{
						label: "Join server",
						url: `roblox://experiences/start?placeId=${this.aw.ActivityPlaceId}&gameInstanceId=${this.aw.ActivityJobId}`
					}
				)
			} else {
				rpc.buttons?.push(
					{
						label:"GitHub",
						url: "https://github.com/ocbwoy3/sober-bloxstraprpc-wrapper"
					}
				)	
			}
			await this.rp.setActivity(rpc,1)
		} catch (e_) {
			console.error("[BloxstrapRPC]", "Failed to update Rich Presence!")
		}

	}
}