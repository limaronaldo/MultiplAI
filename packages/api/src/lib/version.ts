import * as fs from 'fs';
import * as path from 'path';

// In-memory cache (ENG-1667): package.json is immutable at runtime, so we
// read it from disk at most once per process instead of on every call.
let cachedVersion: string | null = null;

/**
 * Reads and returns the version string from package.json.
 * The value is cached in memory after the first read.
 *
 * @returns The version string from the project's package.json
 * @throws Error if package.json cannot be read or version field is missing
 */
export function getVersion(): string {
  if (cachedVersion !== null) {
    return cachedVersion;
  }

  const packageJsonPath = path.resolve(__dirname, '../../package.json');

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${packageJsonPath}`);
  }

  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent) as { version?: string };

  if (!packageJson.version) {
    throw new Error('version field not found in package.json');
  }

  cachedVersion = packageJson.version;
  return cachedVersion;
}

/**
 * Test-only helper to reset the in-memory cache.
 */
export function __resetVersionCacheForTests(): void {
  cachedVersion = null;
}
