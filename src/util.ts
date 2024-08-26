import { lstatSync, readdirSync } from "fs";
import { join } from "path";

export const getMostRecentFile = (dir: string) => {
    const files = orderReccentFiles(dir);
    return files.length ? files[0] : undefined;
};
  
export const orderReccentFiles = (dir: string) => {
    return readdirSync(dir)
    .filter((file) => lstatSync(join(dir, file)).isFile())
    .map((file) => ({ file, mtime: lstatSync(join(dir, file)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
};
