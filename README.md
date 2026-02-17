# OpenThumbnail

OpenThumbnail is a local-first thumbnail workshop for generating, remixing, and exporting YouTube-style thumbnails with OpenRouter image models.

## What you can do

- Create multiple projects and keep each project's timeline/history.
- Import reference images from files or directly from a YouTube URL.
- Generate thumbnails with OpenRouter image models.
- Use personas (reusable reference packs) to keep style consistency.
- Edit generated images (crop, rotate, brightness, contrast, saturation, blur, sharpen).
- Export a single image as JPG or all outputs as a ZIP.
- Export/import a full project backup.
- Switch app language (`English` / `Polish`) and theme (`light` / `dark` / `system`).

## Requirements

- Node.js 20+ (recommended for modern Vite/TanStack Start tooling)
- A package manager (`bun`, `npm`, `pnpm`, or `yarn`)
- An [OpenRouter](https://openrouter.ai/) API key for image generation

## Quick Start

1. Install dependencies:

```bash
bun install
```

2. Start the app:

```bash
bun run dev
```

3. Open `http://localhost:3000`
4. Go to **Settings** and paste your OpenRouter API key (`sk-or-v1-...`)
5. Create a project and start generating thumbnails

If you use npm:

```bash
npm install
npm run dev
```

## Typical User Workflow

1. Create a project from the home screen.
2. Add references:
- Upload one or more local images.
- Or paste a YouTube URL to import the best available thumbnail automatically.
3. Choose a model, aspect ratio, resolution (`720p` or `1080p`), and output count.
4. Generate outputs, then remix/edit the best result.
5. Export:
- Single image as JPG.
- Batch ZIP for all outputs.
- Full project backup for migration/archive.

## Scripts

- `bun run dev` - start dev server on port `3000`
- `bun run build` - production build
- `bun run preview` - preview production build
- `bun run test` - run tests
- `bun run lint` - run ESLint
- `bun run format` - run Prettier
- `bun run check` - format + auto-fix lint issues

## Data, Privacy, and Storage

- The app is local-first. Project data is stored in your browser (IndexedDB + localStorage).
- Your OpenRouter API key is stored locally in browser storage.
- Generated/reference images and timeline state stay on your machine unless you explicitly call an external model API.
- Image generation requests are sent to OpenRouter using your key.
- Large projects can hit browser quota limits. Use cleanup/export backup if storage warnings appear.

## Troubleshooting

- **No models appear**: confirm your OpenRouter API key is set correctly in Settings.
- **Generation fails**: try a different model or simpler prompt; some providers have model-specific limitations.
- **YouTube import fails**: verify the URL format (`youtube.com/watch`, `youtube.com/shorts`, or `youtu.be`).
- **Storage quota errors**: export and remove older projects/assets.

## Tech Stack

- TanStack Start + TanStack Router
- React + TypeScript
- Tailwind CSS + shadcn-style components
- IndexedDB (`idb`) for local data
- OpenRouter SDK + `@tanstack/ai` for image generation

## License

No license file is currently included in this repository.
