import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');  // Add this line to reference root

// Update paths to reference from root
const cargoPath = join(rootDir, 'src-tauri', 'Cargo.toml');
const tauriConfigPath = join(rootDir, 'src-tauri', 'tauri.conf.json');
const packagePath = join(rootDir, 'package.json');
const readmePath = join(rootDir, 'README.md');

// Get new version from command line argument
const newVersion = process.argv[2];

if (!newVersion) {
  console.error('Please provide a version number');
  process.exit(1);
}

try {
  // Update Cargo.toml (in src-tauri directory)
  let cargoContent = readFileSync(cargoPath, 'utf8');
  cargoContent = cargoContent.replace(
    /name = "checksum-check"/,
    'name = "simplegit"'
  );
  cargoContent = cargoContent.replace(
    /version = "(.*?)"/,
    `version = "${newVersion}"`
  );
  writeFileSync(cargoPath, cargoContent);
  console.log('Updated Cargo.toml');

  // Update tauri.conf.json (in src-tauri directory)
  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
  tauriConfig.package.productName = "SimpleGit";
  tauriConfig.package.version = newVersion;
  // Update window title to include version
  tauriConfig.tauri.windows[0].title = `SimpleGit v${newVersion}`;
  // Update identifier
  tauriConfig.tauri.bundle.identifier = "com.simplegit.dev";
  writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2));
  console.log('Updated tauri.conf.json and window title');

  // Update package.json (in root directory)
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  packageJson.name = "simplegit";
  packageJson.version = newVersion;
  writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
  console.log('Updated package.json');

  // Update README.md (in root directory)
  let readmeContent = readFileSync(readmePath, 'utf8');
  readmeContent = readmeContent.replace(
    /# Simple Git \(v.*?\)/,
    `# Simple Git (v${newVersion})`
  );
  writeFileSync(readmePath, readmeContent);
  console.log('Updated README.md');

  console.log(`\nSuccessfully updated project name to Simple Git and version to ${newVersion} in all configuration files`);
} catch (error) {
  console.error('Error updating version numbers:', error.message);
  console.error('Error details:', error);
  process.exit(1);
}