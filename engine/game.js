
import { clone, freshAuctionState, advanceDay, getManager, log } from "./rules.js";
import { assertRule } from "./errors.js";
import { shuffle } from "./rng.js";

export function createGame({
  gameId = crypto.randomUUID(), mode = "full", managerNames, content,
  balance = null, rng = Math.random, contentVersion = content?.config?.version ?? "unknown"
}) {
  assertRule(Array.isArray(managerNames) && managerNames.length >= 2 && managerNames.length <= 4,
    "INVALID_PLAYER_COUNT", "Sunday Manager supports 2–4 managers.");

  const shuffledPlayers = shuffle(clone(content.players), rng);
  const shuffledTargets = shuffle(clone(content.targets), rng);
  const shuffledSponsors = shuffle(clone(content.sponsors), rng);
  const shuffledStaff = shuffle(clone(content.staff), rng);
  const shuffledBoards = shuffle(clone(content.boards), rng);

  const managers = managerNames.map((name, i) => ({
    id: `manager_${i + 1}`,
    name,
    cash: shuffledSponsors[i]?.startingBudget ?? 1000,
    trainingLevel: 0,
    clubDNA: content.dna.types?.[i % 6] ?? ["beer_lover","hothead","mercenary","old_timer","warrior","youngster"][i % 6],
    sponsor: shuffledSponsors[i] || null,
    staff: mode === "full" ? shuffledStaff[i] || null : null,
    transferTarget: shuffledTargets[i] || null,
    managerBoard: mode === "full" ? shuffledBoards[i] || null : null,
    lockerRoom: [],
      completedProjects: [],
    availablePlayers: [],
    soldPlayers: [],
    eventHand: [],
    leadershipBlunders: [],
    projectPrestige: 0,
    trainingTrophyPrestige: 0,
    staffCaptainScore: 0,
    targetScore: 0,
    perkState: {
      uses: {},
      enabled: mode === "full",
      upgradeDiscount: 0,
      projectDiscount: 0,
      injuryPenaltyImmunity: 0,
      extraEventReveal: false,
      activityReplacementCash: 0,
      costWaiver: 0,
      activityOverride: null,
      turnOrderShifted: false,
      extraTargetRole: false,
      protectedPlayerId: null,
      negotiatorPassActive: false,
      negotiatorPassPlayerId: null
    }
  }));

  const state = {
    gameId,
    schemaVersion: "1.0",
    contentVersion,
    mode,
    playerCount: managers.length,
    week: 1,
    day: "setup",
    turnOrder: managers.map(m => m.id),
    currentManagerId: managers[0].id,
    managers,
    content,
    balance,
    playerDeck: shuffledPlayers,
    discardPile: [],
    auction: freshAuctionState(),
    eventSystem: {
      deck: buildEventDeck(content, rng),
      mondayResolved: false
    },
    trainingTrophyOwner: null,
    auditLog: []
  };

  log(state, null, "game_created", { mode, managerNames });
  return state;
}

function buildEventDeck(content, rng = Math.random) {
  const all = [
    ...content.events.upgrades.map(x => ({...x, category:"upgrade"})),
    ...content.events.injuries.map(x => ({...x, category:"injury"})),
    ...content.events.healing.map(x => ({...x, category:"healing"})),
    ...content.events.projects.map(x => ({...x, category:"project"})),
    ...content.events.training.map(x => ({...x, category:"training"})),
    ...content.events.blunders.map(x => ({...x, category:"leadership_blunder"})),
    ...content.events.wildcards.map(x => ({...x, category:"wildcard"})),
    ...content.events.sabotages.map(x => ({...x, category:"sabotage"}))
  ];
  return shuffle(all, rng);
}

export function startGame(state) {
  assertRule(state.day === "setup", "WRONG_PHASE", "Game has already started.");
  state.day = "saturday";
  state.auction = freshAuctionState();
  state.currentManagerId = state.turnOrder[0];
  return state;
}

export function nextDay(state) {
  const day = advanceDay(state);
  if (day === "monday") {
    dealMonday(state);
  }
  return day;
}

export function dealMonday(state) {
  const managers = state.managers;
  for (const m of managers) {
    const cards = [];
    while (cards.length < 3 && state.eventSystem.deck.length) {
      cards.push(state.eventSystem.deck.pop());
    }
    m.mondayDraw = cards;
  }
  return state;
}

export function finishWeek(state) {
  assertRule(state.day === "friday", "WRONG_PHASE", "Week can only finish on Friday.");
  if (state.week < 4) {
    state.week += 1;
    state.day = "saturday";
    state.auction = freshAuctionState();
    for (const manager of state.managers) {
      const board = manager.managerBoard?.perk;
      if (board?.uses === "once_per_week") manager.perkState.uses = {};
      manager.perkState.negotiatorPassActive = false;
      manager.perkState.negotiatorPassPlayerId = null;
    }
  } else {
    state.day = "deadline";
    state.auction = freshAuctionState();
  }
  return state;
}
