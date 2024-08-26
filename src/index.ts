import { exec } from "child_process";
import * as constants from "./constants";
import { ActivityWatcher } from "./ActivityWatcher";
import { BloxstrapRPC } from "./BloxstrapRPC";
import { clearInterval } from "timers";
import { readdirSync, rmSync } from "fs";
import { join } from "path";

console.log("[MAIN]","Deleting ALL old log files")
readdirSync(constants.LOGFILE_PATH).forEach((file:string)=>{
	const fullname = join(constants.LOGFILE_PATH,file)
	rmSync(fullname)
	console.log("[MAIN]",`-> Deleted ${fullname}`)
})

console.log("[MAIN]",`Launching Sober with command: ${constants.LAUNCH_COMMAND}`);
const soberProcess = exec(constants.LAUNCH_COMMAND)

const activityWatcher = new ActivityWatcher(soberProcess);
activityWatcher.stdoutWatcher();

const richPresenceMain = new BloxstrapRPC(activityWatcher);
const richPresenceInterval = setInterval(()=>{
	try {
		richPresenceMain.updateRichPresence()
	} catch(e_) {
		console.error("[MAIN]","Failed to update rich presence in interval!")
		console.error("[MAIN]",e_)
	}
},100)

async function clearRichPresence(): Promise<void> {
	try {
		await richPresenceMain.rp?.setActivity({})
	} catch {}
	try {
		await richPresenceMain.rp?.destroy()
	} catch {}
}

process.on("SIGINT",async()=>{
	console.log("\n");
	console.warn("[MAIN]","Received CTRL+C signal, killing!");
	try { clearInterval(richPresenceInterval); } catch {}
	await clearRichPresence()
	soberProcess.kill(0);
	process.exit(0);
});

soberProcess.on("exit",async()=>{
	console.log("\n");
	console.warn("[MAIN]","Sober died, exiting!");
	try { clearInterval(richPresenceInterval); } catch {}
	await clearRichPresence()
	process.exit(0);
})