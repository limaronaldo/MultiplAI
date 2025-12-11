import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads and returns the version string from package.json.
 * 
 * @returns The version string from the project's package.json
 * @throws Error if package.json cannot be read or version field is missing
 */
export function getVersion(): string {
  const packageJsonPath = path.resolve(__dirname, '../../package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${packageJsonPath}`);
  }
  
  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent) as { version?: string };
  
  if (!packageJson.version) {
    throw new Error('version field not found in package.json');
  }
  
  return packageJson.version;
}