# PITCHERA Runtime v0.1 — Repo setup

## 1. What to upload

Upload the CONTENTS of this folder into your PITCHERA project.

Recommended structure:

PITCHERA/
  engine/
  content/
  tests/
  package.json

Do NOT upload the historical audit/optimizer/Monte-Carlo files from the old engine ZIP.

## 2. Important

The current adapter is the boundary for the future PWA. The UI should not import
rules.js/game.js directly.

Use:

```js
import { PitcheraGameController } from "./engine/adapter.js";
```

Then:

```js
const game = await new PitcheraGameController().init();
game.createLocalGame(["Manager 1","Manager 2","Manager 3","Manager 4"]);
```

## 3. Current limitation

v0.1 is the runtime boundary, not yet the complete UI command mapping. Before packaging
the final PWA, every user action will be mapped to an explicit adapter command and tested.

## 4. Static hosting

Because content is loaded with fetch(), run the PWA through a local/static HTTP server
(e.g. VS Code Live Server). Opening index.html directly as file:// is not supported.
