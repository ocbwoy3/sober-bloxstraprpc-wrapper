import { ChildProcess, exec } from "child_process";
import { Message, ServerType } from "./types";
import EventEmitter from "events";
import { LOGFILE_PATH, RECENT_LOG_THRESHOLD_SECONDS } from "./constants";
import { open } from "fs/promises";
import { join } from "path";
import { getMostRecentFile } from "./util";
import { readFileSync, watchFile } from "fs";
import { buffer } from "node:stream/consumers";

function escapeRegExp(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 2024-08-25T19:16:40.287Z,68.287468,b2e006c0,6 [FLog::Network] UDMUX Address = XXX.XXX.XX.XX, Port = XXXXX | RCC Server Address = XX.XX.X.XXX, Port = XXXXX
const timestampRegExp = /(^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z,\d+\.\d+,[a-z0-9]+,\d+) /;

function removeTimestamp(s: string) {
	return s.replace(timestampRegExp, '');
}

// log stuff and regex from https://github.com/pizzaboxer/bloxstrap/blob/main/Bloxstrap/Integrations/ActivityWatcher.cs

const GameJoiningEntry = ("[FLog::Output] ! Joining game");
const GameJoiningPrivateServerEntry = ("[FLog::GameJoinUtil] GameJoinUtil::joinGamePostPrivateServer");
const GameJoiningReservedServerEntry = ("[FLog::GameJoinUtil] GameJoinUtil::initiateTeleportToReservedServer");
const GameJoiningUDMUXEntry = ("[FLog::Network] UDMUX Address = ");
const GameJoinedEntry = ("[FLog::Network] serverId:");
const GameDisconnectedEntry = ("[FLog::Network] Time to disconnect replication data:");
const GameTeleportingEntry = ("[FLog::SingleSurfaceApp] initiateTeleport");
const GameMessageEntry = ("[FLog::Output] [BloxstrapRPC]");
const GameLeavingEntry = ("[FLog::SingleSurfaceApp] leaveUGCGameInternal");

const GameJoiningEntryPattern = /! Joining game '([0-9a-f\-]{36})' place ([0-9]+) at ([0-9\.]+)/;
const GameJoiningUDMUXPattern = /UDMUX Address = ([0-9\.]+), Port = [0-9]+ \| RCC Server Address = ([0-9\.]+), Port = [0-9]+/;
const GameJoinedEntryPattern = /serverId: ([0-9\.]+)\|[0-9]+/;
const GameMessageEntryPattern = /\[BloxstrapRPC\] (.*)/;

export class ActivityWatcher {

	private _teleportMarker: boolean = false;
	private _reservedTeleportMarker: boolean = false;

	public ActivityInGame: boolean = false;
	public ActivityPlaceId: number = 0;
	public ActivityJobId: string = "";
	public ActivityMachineAddress: string = "";
	public ActivityMachineUDMUX: boolean = false;
	public ActivityIsTeleport: boolean = false;
	public ActivityServerType: ServerType = ServerType.PUBLIC;

	public BloxstrapRPCEvent = new EventEmitter()
	// OnGameJoin - Player joined the game
	// OnGameLeave - Player left the game
	// Message - BloxstrapRPC Message
	
	private roblox: ChildProcess|undefined;
	private lastChunk: string = "";
	
	constructor(process: ChildProcess) {
		this.roblox = process;
		console.log("[ActivityWatcher]",`Obtained Sober process, PID: ${process.pid}`);
	};

	private async onStdout(line_: string): Promise<void> {
		const line: string = removeTimestamp(line_)
		console.log('\x1b[2m[STDOUT] %s\x1b[0m',line.toString());
		if (!this.ActivityInGame && this.ActivityPlaceId === 0) {
			if (line.includes(GameJoiningPrivateServerEntry)) {
				this.ActivityServerType = ServerType.PRIVATE
			}

			if (line.includes(GameJoiningEntry)) {
				const match: RegExpMatchArray = line.match(GameJoiningEntryPattern) as RegExpMatchArray;
				match.splice(0,1)
				// console.debug("includes(GameJoiningEntry)",line,match);
	
				if (match.length !== 3) {
					console.error("[ActivityWatcher]", "Failed to assert format for game join entry");
					console.error("[ActivityWatcher]", line);
					return;
				};
	
				this.ActivityInGame = false;
				this.ActivityPlaceId = Number.parseInt(match[1]);
				this.ActivityJobId = match[0];
				this.ActivityMachineAddress = match[2];
	
				if (this._teleportMarker) {
					this.ActivityIsTeleport = true;
					this._teleportMarker = false;
				};
	
				if (this._reservedTeleportMarker) {
					this.ActivityServerType = ServerType.RESEREVED;
					this._reservedTeleportMarker = false;
				};
	
				console.log("[ActivityWatcher]", `Joining Game (${this.ActivityPlaceId}/${this.ActivityJobId}/${this.ActivityMachineAddress})`);
			}
		} else if (!this.ActivityInGame && this.ActivityPlaceId !== 0) {
			if (line.includes(GameJoiningUDMUXEntry)) {
				const match: RegExpMatchArray = line.match(GameJoiningUDMUXPattern) as RegExpMatchArray;
				match.splice(0,1)
				// console.debug("includes(GameJoiningUDMUXEntry)",line,match);

				if (match.length !== 2 || match[1] !== this.ActivityMachineAddress) {
					console.error("[ActivityWatcher]", "Failed to assert format for game join UDMUX entry");
					console.error("[ActivityWatcher]", line);
					return;
				}

				this.ActivityMachineAddress = match[0];
				this.ActivityMachineUDMUX = true;

				console.log("[ActivityWatcher]", `Server is UDMUX protected (${this.ActivityPlaceId}/${this.ActivityJobId}/${this.ActivityMachineAddress})`);
			} else if (line.includes(GameJoinedEntry)) {
				const match: RegExpMatchArray = line.match(GameJoinedEntryPattern) as RegExpMatchArray;
				match.splice(0,1)
				// console.debug("includes(GameJoinedEntry)",line,match);

				if (match.length !== 1 || match[0] !== this.ActivityMachineAddress) {
					// console.debug("includes(GameJoinedEntry)",match.length,match,this.ActivityMachineAddress)
					console.error("[ActivityWatcher]", "Failed to assert format for game joined entry");
					console.error("[ActivityWatcher]", line);
					return;
				}

				this.ActivityInGame = true;
				this.BloxstrapRPCEvent.emit("OnGameJoin");
				try { exec(`notify-send -t 3500 -u low "Server Joined" "Place ID: ${this.ActivityPlaceId}${this.ActivityMachineUDMUX ? "\\n(UDMUX Protected)":""}"`) } catch {};
				console.log("[ActivityWatcher]", `Joined Game (${this.ActivityPlaceId}/${this.ActivityJobId}/${this.ActivityMachineAddress})`);
				// OnGameJoin?.Invoke(this, new EventArgs());
			}
		} else if (this.ActivityInGame && this.ActivityPlaceId !== 0) {
			if (line.includes(GameDisconnectedEntry)) {
				console.log("[ActivityWatcher]", "Disconnected from Game ({ActivityPlaceId}/{ActivityJobId}/{ActivityMachineAddress})");

				this.ActivityInGame = false;
				this.ActivityPlaceId = 0;
				this.ActivityJobId = "";
				this.ActivityMachineAddress = "";
				this.ActivityMachineUDMUX = false;
				this.ActivityIsTeleport = false;
				this.ActivityServerType = ServerType.PUBLIC;

				this.BloxstrapRPCEvent.emit("OnGameLeave")
				// OnGameLeave?.Invoke(this, new EventArgs());
			}  else if (line.includes(GameTeleportingEntry)) {
				console.log("[ActivityWatcher]", "Initiating teleport to server ({ActivityPlaceId}/{ActivityJobId}/{ActivityMachineAddress})");
				this._teleportMarker = true;
			} else if (this._teleportMarker && line.includes(GameJoiningReservedServerEntry)) {
				this._reservedTeleportMarker = true;
			} else if (line.includes(GameMessageEntry)) {
				const match: RegExpMatchArray = line.match(GameMessageEntryPattern) as RegExpMatchArray;
				match.splice(0,1)

				let message: Message | undefined;

				try {
					message = JSON.parse(match[0]);
				} catch(e_) {
					console.error("[ActivityWatcher]", "Failed to parse BloxstrapRPC Message! (JSON deserialization threw an exception)");
					console.error("[ActivityWatcher]", e_)
					return;
				}

				if (!message) {
					console.warn("[ActivityWatcher]","Parsed JSON is null!");
					return;
				}

				try {
					if (message.command === "SetRichPresence") {
						this.BloxstrapRPCEvent.emit("Message",message.data)
					} else if (message.command === "Debug") {

						console.debug({
							_teleportMarker: this._teleportMarker,
							_reservedTeleportMarker: this._reservedTeleportMarker,

							ActivityInGame: this.ActivityInGame,
							ActivityPlaceId: this.ActivityPlaceId,
							ActivityJobId: this.ActivityJobId,
							ActivityMachineAddress: this.ActivityMachineAddress,
							ActivityMachineUDMUX: this.ActivityMachineUDMUX,
							ActivityIsTeleport: this.ActivityIsTeleport,
							ActivityServerType: this.ActivityServerType
						})
						// x/print('[BloxstrapRPC] {"command":"Debug"}')
					}
				} catch {}

			}
		}
	}

	public async getLogfile(): Promise<string> {
		if (!this.roblox) throw new Error("ActivityWatcher.roblox is undefined!");

		console.log("[ActivityWatcher]",`Finding Roblox's most recent logfile in: ${LOGFILE_PATH}`)

		let attempts = 0
		while (true) {

			const latestFile: {file:string, mtime:Date} | undefined = getMostRecentFile(LOGFILE_PATH)

			if (latestFile && Date.now() - latestFile.mtime.getTime() <= RECENT_LOG_THRESHOLD_SECONDS * 1000) {
				return join(LOGFILE_PATH+latestFile.file)
			}

			await new Promise(resolve=>setTimeout(resolve,200))
			attempts++
			if (attempts > 20) {
				console.error("[ActivityWatcher]",`Cannot find Roblox's newest logfile, killing!`);			
				this.roblox.kill(1);
				process.exit(1);
			}
		}

	}

	public async stdoutWatcher(): Promise<void> {
		if (!this.roblox) {
			console.error("[ActivityWatcher]",`activityWatcher.roblox is undefined!`);			
			return;
		}
		if (!this.roblox.stdout) {
			console.error("[ActivityWatcher]",`Roblox's stdout doesn't exist, killing!`);			
			this.roblox.kill(1);
			process.exit(1);
			return;
		}

		const robloxLogfile = await this.getLogfile();
		console.log("[ActivityWatcher]",`Got Roblox log file: ${robloxLogfile}`)

		const logHandle = await open(robloxLogfile,'r+');
		console.log("[ActivityWatcher]",`Opened readonly handle to log file.`)

		try {
			let position = 0;
			let line = ""
		
			while (true) {
				const bytesRead = await logHandle.read(Buffer.alloc(1), 0, 1, position);
				if (bytesRead.buffer.toString().charCodeAt(0) === 0) {
					await new Promise(resolve => setTimeout(resolve, 1));
				} else {
					const newChar = bytesRead.buffer.toString();
					position += 1;
					if (newChar === '\n') {
						const line2 = line
						line = ""
						try {
							this.onStdout(line2).catch((reason:string)=>{
								console.error("[ActivityWatcher]","ActivityWatcher.onStdout promise rejected:",reason)
							});
						} catch(e_) {
							console.error("[ActivityWatcher]","ActivityWatcher.onStdout errored!");
							console.error(e_);
						}
					} else {
						line += newChar
					}
				}
			}
		} catch(e_) {
			console.error("[ActivityWatcher]","Failed to read from handle!");
			console.error(e_);
		} finally {
			logHandle.close()
		}
	}

	public async stdoutWatcherOld(): Promise<void> {
		if (!this.roblox) {
			console.error("[ActivityWatcher]",`activityWatcher.roblox is undefined!`);			
			return;
		}
		if (!this.roblox.stdout) {
			console.error("[ActivityWatcher]",`Roblox's stdout doesn't exist, killing!`);			
			this.roblox.kill(1);
			process.exit(1);
			return;
		}
		this.roblox.stdout.addListener("data",(chunk: string)=>{
			console.log("[ActivityWatcher]","Received stdout data!");
			const thisChunk = chunk.toString();
			const stdoutData: string[] = (this.lastChunk+thisChunk).split("\n");
			this.lastChunk = stdoutData.pop() as string;
			stdoutData.forEach((line: string)=>{
				try {
					this.onStdout(line).catch((reason:string)=>{
						console.error("[ActivityWatcher]","ActivityWatcher.onStdout promise rejected:",reason)
					});
				} catch(e_) {
					console.error("[ActivityWatcher]","ActivityWatcher.onStdout errored!");
					console.error(e_);
				}
			})
		})
	}

};