# Contributing to AlabJS

First off, thank you for considering contributing to AlabJS! It's people like you that make AlabJS a great tool for everyone.

> [!NOTE]
> AlabJS is under active development. If you're looking for something to work on, check the [GitHub Issues](https://github.com/alabjsjs/alabjs/issues) for "good first issue" labels.

---

## 🏗️ Environment Setup

AlabJS is a monorepo containing both Rust (the compiler core) and TypeScript (the framework runtime).

### Prerequisites
- **Node.js**: v22.0.0 or higher.
- **pnpm**: v10.0.0 or higher.
- **Rust**: Latest stable version (via [rustup](https://rustup.rs/)).
- **turbo**: Recommended to install globally (`npm i -g turbo`).

### Getting Started
1. **Clone the repository**:
   ```bash
   git clone https://github.com/alabjsjs/alabjs.git
   cd alabjs
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Initial Build**:
   Build the compiler and all packages once to ensure everything is wired correctly:
   ```bash
   pnpm build
   ```

---

## 🛠️ Development Workflow

We use **Turbo** to manage the monorepo tasks across packages and crates.

### Core Architecture
- `crates/*`: Rust-native core, including the oxc-based compiler and router logic.
- `packages/*`: Node.js and Browser runtimes, Vite plugins, and CLI.

### Common Commands
- **Start development mode**: `pnpm dev`
- **Build the whole project**: `pnpm build`
- **Clean builds and caches**: `pnpm clean`

### Working on Examples
The best way to test changes is to run one of the included examples in the `examples/` directory:
```bash
pnpm dev:basic-ssr
```

---

## 🧪 Testing

We value high test coverage. Every new feature or bug fix should include tests.

### JavaScript/TypeScript Tests
We use **Vitest** for all JS-side logic.
- **Run all JS tests**: `pnpm test` (at project root)
- **Run tests for a specific package**: `cd packages/alabjsjs && pnpm test`

### Rust Tests
We use **Cargo** for the compiler and router logic.
- **Run Rust tests**: `cargo test --workspace`

---

## 📝 Pull Request Guidelines

1. **Keep it focused**: One PR per feature or bug fix.
2. **Follow coding styles**: Use the provided Prettier/ESLint configs for JS, and `cargo fmt` / `clippy` for Rust.
3. **Commit Messages**: We follow a loosely structured format:
   - `feat: ...` for new features
   - `fix: ...` for bug fixes
   - `docs: ...` for documentation changes
4. **Update Documentation**: If your change affects the public API, update the relevant docs in the `docs/` folder.

## ⚖️ License
By contributing to AlabJS, you agree that your contributions will be licensed under its **MIT License**.
