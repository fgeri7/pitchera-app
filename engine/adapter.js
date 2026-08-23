
import { createGame, startGame } from "./game.js";
import { loadContentBrowser } from "./content-browser.js";
import { validateState } from "./validate.js";

export class PitcheraGameController {
  constructor({ baseContentPath = "./content", rng = Math.random } = {}) {
    this.baseContentPath = baseContentPath;
    this.rng = rng;
    this.content = null;
    this.state = null;
    this.listeners = new Set();
  }

  async init() {
    this.content = await loadContentBrowser(this.baseContentPath);
    return this;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this.getState());
  }

  getState() {
    return this.state;
  }

  createLocalGame(managerNames) {
    if (!this.content) throw new Error("Controller not initialized.");
    this.state = createGame({
      gameId: crypto.randomUUID(),
      mode: "local",
      managerNames,
      content: this.content,
      rng: this.rng,
      contentVersion: this.content.config?.version ?? "unknown"
    });
    this.emit();
    return this.state;
  }

  start() {
    this.#requireGame();
    this.state = startGame(this.state);
    this.#validateAndEmit();
    return this.state;
  }

  // Generic engine command bridge. The adapter deliberately owns mutation access.
  dispatch(command, payload = {}) {
    this.#requireGame();
    const fn = this.#resolveCommand(command);
    this.state = fn(this.state, payload, this.content);
    this.#validateAndEmit();
    return this.state;
  }

  #resolveCommand(command) {
    const commands = this.state?.commands;
    if (commands && typeof commands[command] === "function") return commands[command];
    throw new Error(`Command '${command}' is not exposed by the current engine.`);
  }

  #validateAndEmit() {
    const result = validateState(this.state);
    if (result === false || result?.valid === false) {
      throw new Error("Rules Engine produced an invalid GameState.");
    }
    this.emit();
  }

  #requireGame() {
    if (!this.state) throw new Error("No game exists.");
  }
}
