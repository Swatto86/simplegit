# Simple Git (v1.0.0)

A modern, lightweight Git client built with Tauri, React, and TypeScript.

## Features

- 🚀 Fast and lightweight - built with Rust
- 💻 Cross-platform support (Windows, macOS, Linux)
- 🎨 Modern UI with React and TypeScript
- 🔒 Secure GitHub OAuth integration
- ⚡ Native performance
- 🌈 Multiple theme options (Light, Dark, Colorful)
- 🔄 Full Git operations support:
  - Repository cloning and management
  - Branch operations (create, checkout, merge, delete)
  - Commit operations (stage, commit, revert)
  - Advanced operations (stash, tag, reset)
  - Visual diff viewer

## Releases

### Latest Release

[![Latest Release](https://img.shields.io/github/v/release/Swatto86/simplegit?include_prereleases&label=Latest%20Release)](https://github.com/Swatto86/simplegit/releases/latest)

Download the latest version for your platform:

- **Windows**: [SimpleGit-1.0.0-setup.msi](https://github.com/Swatto86/simplegit/releases/download/v1.0.0/SimpleGit-1.0.0-setup.msi)

### Release History

For a complete list of releases and changes, visit our [Releases page](https://github.com/Swatto86/simplegit/releases).

#### Version 1.0.0 (Latest)

- Initial release
- Core Git operations support
- GitHub integration
- Cross-platform support
- Multiple themes

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://www.rust-lang.org/tools/install)
- [Git](https://git-scm.com/downloads)
- Platform-specific dependencies for Tauri:
  - [Windows Requirements](https://tauri.app/v1/guides/getting-started/prerequisites#windows)

### Installation

1. Clone the repository:
   bash
   git clone <https://github.com/Swatto86/simplegit.git>
   cd simplegit
2. Install dependencies:
   bash
   npm install
3. Start the development server:
   bash
   npm run tauri dev

### Building

To create a production build:
bash
npm run tauri build

The built application will be available in `src-tauri/target/release`.

## GitHub OAuth Setup

To use the GitHub authentication feature, you need to set up a GitHub OAuth App:

1. **Create a GitHub OAuth App**:

   - Go to [GitHub Developer Settings](https://github.com/settings/developers)
   - Click on "New OAuth App"
   - Fill in the required fields:
     - **Application Name**: SimpleGit (or any name you prefer)
     - **Homepage URL**: [http://localhost:5173](http://localhost:5173) (development) or your production URL
     - **Authorization Callback URL**: [http://localhost:3000/callback](http://localhost:3000/callback)
   - Click "Register Application"

2. **Obtain Client ID and Client Secret**:

   - After creating the app, GitHub will provide you with a **Client ID** and **Client Secret**. These are crucial for the OAuth process.

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory with:
   env
   GITHUB_CLIENT_ID=your_client_id_here
   GITHUB_CLIENT_SECRET=your_client_secret_here
4. **Authorize the Application**:
   - When you start the authentication process, you will be redirected to GitHub to authorize the app. This step is necessary to grant the app access to your repositories.

## Project Structure

```text
simplegit/
├── src/ # React frontend source code
│ ├── components/ # UI components
│ │ ├── features/ # Feature-specific components
│ │ └── ui/ # Reusable UI components
│ ├── styles/ # Global styles
│ └── types/ # TypeScript type definitions
├── src-tauri/ # Rust backend code
│ ├── src/ # Rust source files
│ └── Cargo.toml # Rust dependencies
├── public/ # Static assets
├── scripts/ # Build and utility scripts
└── releases/ # Release artifacts
```

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build the production version
- `npm run tauri dev` - Start the Tauri development environment
- `npm run tauri build` - Build the production Tauri application
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking
- `npm run clean` - Clean build artifacts and dependencies
- `npm run build-release` - Build release versions for all platforms

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Tauri](https://tauri.app/) - For the framework that makes this possible
- [React](https://reactjs.org/) - For the frontend framework
- [TypeScript](https://www.typescriptlang.org/) - For type safety
- [Rust](https://www.rust-lang.org/) - For the backend implementation

## Support

If you encounter any problems or have suggestions, please [open an issue](https://github.com/Swatto86/simplegit/issues).

## Security

For security concerns, please send an email to [feedback@swatto.co.uk](mailto:feedback@swatto.co.uk) instead of opening a public issue.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes between versions.
