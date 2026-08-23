# PITCHERA Runtime Engine v0.1

This folder is the runtime subset of the Rules Engine. It intentionally excludes the balance
optimizers, Monte Carlo scripts, audit logs and historical experiments.

Runtime layers:
- engine/*.js — gameplay logic
- content/*.json — pinned content snapshot
- adapter.js — browser-facing controller boundary
- content-browser.js — browser-safe content loader

The adapter is the only intended entry point from the PWA into the engine.
