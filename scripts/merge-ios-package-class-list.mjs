/**
 * Capacitor's iOS sync overwrites root `packageClassList` with only classes found in npm
 * Core plugins. Local SPM plugins must be listed under `ios.packageClassList`; this script
 * merges those into root `packageClassList` so `CapacitorBridge.registerPlugins()` can load them.
 *
 * Run via `capacitor:sync:after` in package.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const configPath = join(process.cwd(), 'ios', 'App', 'App', 'capacitor.config.json');
const json = JSON.parse(readFileSync(configPath, 'utf8'));

const fromPlugins = Array.isArray(json.packageClassList) ? json.packageClassList : [];
const fromIosSpm = Array.isArray(json.ios?.packageClassList) ? json.ios.packageClassList : [];

const seen = new Set();
const merged = [];
for (const name of [...fromPlugins, ...fromIosSpm]) {
  if (typeof name === 'string' && !seen.has(name)) {
    seen.add(name);
    merged.push(name);
  }
}

json.packageClassList = merged;
writeFileSync(configPath, `${JSON.stringify(json, null, '\t')}\n`);
