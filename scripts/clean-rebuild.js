import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Helper function to run shell commands
const runCommand = (command) => {
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Failed to execute command: ${command}`);
    console.error(error);
    process.exit(1);
  }
};

// Helper function to remove directory
const removeDirectory = (path, desc) => {
  if (fs.existsSync(path)) {
    console.log(`Removing ${desc}...`);
    fs.rmSync(path, { recursive: true, force: true });
  }
};

// Directories to clean
const cleanupPaths = [
  { path: join(rootDir, "node_modules"), desc: "node_modules" },
  { path: join(rootDir, "dist"), desc: "dist directory" },
  { path: join(rootDir, "src-tauri", "target"), desc: "Rust build artifacts" },
];

// Remove directories
cleanupPaths.forEach(({ path, desc }) => removeDirectory(path, desc));

// Remove specific files
const filesToRemove = [
  join(rootDir, "package-lock.json"),
  join(rootDir, "yarn.lock"),
  join(rootDir, "pnpm-lock.yaml"),
  join(rootDir, "src-tauri/Cargo.lock"),
];

filesToRemove.forEach((file) => {
  if (fs.existsSync(file)) {
    console.log(`Removing ${file}...`);
    fs.unlinkSync(file);
  }
});

// Clean npm cache
console.log("Cleaning npm cache...");
runCommand("npm cache clean --force");

// Create dist directory
console.log("Creating dist directory...");
fs.mkdirSync("dist", { recursive: true });

// Reinstall dependencies
console.log("Installing dependencies...");
runCommand("npm install");

// Verify Tauri CLI installation
console.log("Verifying Tauri CLI...");
const tauriVersion = "1.5.9";
runCommand(`npm install -D @tauri-apps/cli@^${tauriVersion}`);

// Run type checking
console.log("Running TypeScript type check...");
runCommand("npm run type-check");

console.log("Clean rebuild completed successfully!");
