import { homedir } from "os";

export const LAUNCH_COMMAND = "gamemoderun flatpak run org.vinegarhq.Sober";
export const DISCORD_APPID = "1005469189907173486";
export const SMALL_IMAGE_KEY = "roblox";
export const LOGFILE_PATH = `${homedir()}/.var/app/org.vinegarhq.Sober/data/sober/appData/logs/`; // must end with a slash
export const RECENT_LOG_THRESHOLD_SECONDS = 15;

export const LANG = {
    Activity_VerifiedIcon: " ☑️",
    Activity_Playing: "Playing GAME", // GAME - The game's name.
    ServerType_Private: "In a private server.",
    ServerType_Reserved: "In a reserved server.",
    ServerType_Public: "by CREATOR" // CREATOR - Creator of the game. If they are verified, Activity_VerifiedIcon will be appended to the end of the string. (Not just CREATOR)
};
