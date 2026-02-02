# Project: ingest-music

## Package Manager

This project uses **pnpm**, not npm or yarn.

When running scripts or installing dependencies, always use:
- `pnpm install` (not `npm install`)
- `pnpm run <script>` (not `npm run <script>`)
- `pnpm add <package>` (not `npm add <package>`)

## Available Scripts

- `pnpm typecheck` - Run TypeScript type checking without emitting files
- `pnpm test` - Run tests with vitest
- `pnpm test:watch` - Run tests in watch mode
- `pnpm cli` - Run the CLI directly with tsx

## Project Overview

This is a music ingestion tool that:
1. Extracts audio files from archives (ZIP, TAR, etc.)
2. Analyzes audio format (codec, sample rate, bit depth)
3. Fetches setlists from APIs (Phish.net, Setlist.fm)
4. Matches audio files to setlist songs
5. Converts audio to FLAC if needed (with configurable bit depth/sample rate)
6. Tags files with proper metadata
7. Copies files to a music library with organized structure
8. Generates an ingest log documenting the source format and any conversions applied
