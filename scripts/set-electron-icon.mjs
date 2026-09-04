import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const ico = path.join(root, 'resources', 'icon.ico');
const stamp = path.join(root, 'node_modules', 'electron', 'dist', '.headroom-icon');

if (process.platform !== 'win32' || !fs.existsSync(exe) || !fs.existsSync(ico)) process.exit(0);

const token = `${fs.statSync(ico).mtimeMs}:${fs.statSync(exe).size}`;
if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === token) process.exit(0);

const { rcedit } = await import('rcedit');
await rcedit(exe, { icon: ico });
fs.writeFileSync(stamp, token);
