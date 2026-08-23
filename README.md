# PITCHERA PWA v0.3 — Playable UI

Landscape-first local 4-manager PWA prototype connected to the PITCHERA Rules Engine through PitcheraGameController.

## Run
Use a static HTTP server (e.g. VS Code Live Server). `file://` is not supported because content is loaded with fetch().

## Current flow
- Local game setup
- 4 manager selection
- Real GameState rendering
- Saturday auction market
- Real bid commands
- Day progression
- Activities
- Manager Board status
- Event entry point
- Roster rendering
- Engine validation after mutating commands

This is the first playable UI layer; later versions will expose the complete event/staff/sponsor/target flows.
