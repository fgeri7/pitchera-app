
import { createGame, startGame, nextDay, finishWeek } from "./game.js";
import {
  startAuction, bid, resolveAuction, seatPlayer, chooseActivity, mondayDeal,
  playEvent, sellPlayer, healAtPhysio, recalculateTurnOrder,
  evaluateSponsorTask, claimSponsorTask, payday, calculateFinalScore,
  evaluateTransferTarget, resolveTrainingTrophy, useStaffAbility,
  getStaffAbilityStatus, useManagerBoard, getBoardPerkStatus,
  getCurrentManager
} from "./rules.js";
import { useManagerPerk } from "./perks.js";
import { loadContentBrowser } from "./content-browser.js";
import { validateState } from "./validate.js";

const MUTATING = new Set([
  "start","nextDay","finishWeek","startAuction","bid","resolveAuction",
  "seatPlayer","chooseActivity","mondayDeal","playEvent","sellPlayer",
  "healAtPhysio","recalculateTurnOrder","claimSponsorTask","payday",
  "evaluateTransferTarget","resolveTrainingTrophy","useStaffAbility",
  "useManagerBoard","useManagerPerk"
]);

export class PitcheraGameController {
  constructor({ baseContentPath = "./content", rng = Math.random, idFactory } = {}) {
    this.baseContentPath = baseContentPath;
    this.rng = rng;
    this.idFactory = idFactory ?? (() => crypto.randomUUID());
    this.content = null;
    this.state = null;
    this.listeners = new Set();
  }

  async init() {
    this.content = await loadContentBrowser(this.baseContentPath);
    return this;
  }

  // Test/browser integration hook; avoids filesystem/network dependency in unit tests.
  initWithContent(content) {
    this.content = content;
    return this;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState() { return this.state; }

  createLocalGame(managerNames) {
    if (!this.content) throw new Error("Controller not initialized.");
    this.state = createGame({
      gameId: this.idFactory(),
      mode: "full",
      managerNames,
      content: this.content,
      rng: this.rng,
      contentVersion: this.content.config?.version ?? "unknown"
    });
    this.#validate();
    this.emit();
    return this.state;
  }

  start() {
    this.#requireGame();
    this.state = startGame(this.state);
    return this.#commit();
  }

  dispatch(command, payload = {}) {
    this.#requireGame();

    if (command === "getState") return this.getState();
    if (command === "getCurrentManager") return getCurrentManager(this.state);

    const handler = this.#commands()[command];
    if (!handler) throw new Error(`Unknown PITCHERA command: ${command}`);

    const result = handler(payload);
    if (MUTATING.has(command)) this.#commit();
    return result;
  }

  #commands() {
    const s = this.state;
    return {
      start: () => { this.state = startGame(s); return this.state; },
      nextDay: () => { nextDay(s); return s.day; },
      finishWeek: () => { finishWeek(s); return s.day; },

      startAuction: ({ playerIds }) => startAuction(s, playerIds),
      bid: ({ managerId, playerId, amount }) => bid(s, managerId, playerId, amount),
      resolveAuction: () => resolveAuction(s),

      seatPlayer: ({ managerId, playerId, options }) =>
        seatPlayer(s, managerId, playerId, options),
      chooseActivity: ({ managerId, activity }) =>
        chooseActivity(s, managerId, activity),

      mondayDeal: ({ stacksByManager }) => mondayDeal(s, stacksByManager),
      playEvent: ({ managerId, eventId, target }) =>
        playEvent(s, managerId, eventId, target),

      sellPlayer: ({ managerId, playerId }) =>
        sellPlayer(s, managerId, playerId),
      healAtPhysio: ({ managerId, playerId }) =>
        healAtPhysio(s, managerId, playerId),
      recalculateTurnOrder: () => recalculateTurnOrder(s),

      evaluateSponsorTask: ({ managerId, week }) =>
        evaluateSponsorTask(s, managerId, week),
      claimSponsorTask: ({ managerId, week }) =>
        claimSponsorTask(s, managerId, week),
      payday: () => payday(s),

      calculateFinalScore: ({ managerId }) =>
        calculateFinalScore(s, managerId),
      evaluateTransferTarget: ({ managerId }) =>
        evaluateTransferTarget(s, managerId),
      resolveTrainingTrophy: () => resolveTrainingTrophy(s),

      useStaffAbility: ({ managerId, payload }) =>
        useStaffAbility(s, managerId, payload),
      getStaffAbilityStatus: ({ managerId }) =>
        getStaffAbilityStatus(s, managerId),
      useManagerBoard: ({ managerId, action, payload }) =>
        useManagerBoard(s, managerId, action, payload),
      getBoardPerkStatus: ({ managerId }) =>
        getBoardPerkStatus(s, managerId),
      useManagerPerk: ({ managerId, payload }) =>
        useManagerPerk(s, managerId, payload)
    };
  }

  subscribeOnce(listener) {
    const unsubscribe = this.subscribe(state => {
      unsubscribe();
      listener(state);
    });
    return unsubscribe;
  }

  emit() {
    for (const listener of this.listeners) listener(this.getState());
  }

  #commit() {
    this.#validate();
    this.emit();
    return this.state;
  }

  #validate() {
    const result = validateState(this.state);
    if (!result?.valid) {
      const details = result?.errors?.join("; ") || "unknown state validation error";
      throw new Error(`Rules Engine produced an invalid GameState: ${details}`);
    }
  }

  #requireGame() {
    if (!this.state) throw new Error("No game exists.");
  }
}

export const PITCHERA_COMMANDS = Object.freeze([
  "start","nextDay","finishWeek","startAuction","bid","resolveAuction",
  "seatPlayer","chooseActivity","mondayDeal","playEvent","sellPlayer",
  "healAtPhysio","recalculateTurnOrder","evaluateSponsorTask",
  "claimSponsorTask","payday","calculateFinalScore","evaluateTransferTarget",
  "resolveTrainingTrophy","useStaffAbility","getStaffAbilityStatus",
  "useManagerBoard","getBoardPerkStatus","useManagerPerk"
]);
