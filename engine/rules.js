
import { assertRule } from "./errors.js";

export const DAYS = [
  "setup", "saturday", "sunday", "monday", "tuesday",
  "wednesday", "thursday", "friday", "deadline",
  "final_scoring", "finished"
];

export function clone(value) {
  return structuredClone(value);
}

export function getPlayerPrestige(player, manager, state) {
  if (!player) return 0;

  let value;
  if (player.card.rarity === "workhorse") {
    value = 2 + manager.trainingLevel;
  } else if (player.card.rarity === "talent") {
    const mentor = manager.lockerRoom.find(p => p.card.id === player.mentorId);
    value = mentor ? getBasePrestige(mentor, manager, state) : 0;
  } else {
    value = player.card.basePrestige;
  }

  const upgradePrestige = player.upgrades.reduce((sum, u) => sum + (u.prestige || 0), 0);
  const injuryPenalty = player.injuryId
    ? (state.content.events.injuries.find(i => i.id === player.injuryId)?.prestigePenalty || 0)
    : 0;

  return Math.max(0, value + upgradePrestige + injuryPenalty);
}

export function getBasePrestige(player, manager, state) {
  if (player.card.rarity === "workhorse") return 2 + manager.trainingLevel;
  if (player.card.rarity === "talent") {
    const mentor = manager.lockerRoom.find(p => p.card.id === player.mentorId);
    return mentor ? getBasePrestige(mentor, manager, state) : 0;
  }
  return player.card.basePrestige;
}

export function canSeatPlayer(manager, player) {
  return manager.lockerRoom.length < 4 && !manager.lockerRoom.some(p => p.card.id === player.card.id);
}

export function seatPlayer(state, managerId, playerId, options = {}) {
  const manager = getManager(state, managerId);
  const player = findOwnedOrAvailablePlayer(state, managerId, playerId);

  assertRule(canSeatPlayer(manager, player), "LOCKER_FULL", "The locker room has no free seat.");
  assertRule(!player.injuryId || options.allowInjured === true,
    "INJURED_SEAT", "Injured players may not be seated unless explicitly allowed by a card effect.");

  if (player.card.rarity === "talent") {
    const candidates = manager.lockerRoom.filter(p => p.card.rarity !== "talent");
    if (options.mentorId) {
      assertRule(candidates.some(p => p.card.id === options.mentorId),
        "INVALID_MENTOR", "Selected mentor is not eligible.");
      player.mentorId = options.mentorId;
    } else if (candidates.length) {
      const mentor = candidates.reduce((best, p) =>
        getBasePrestige(p, manager, state) > getBasePrestige(best, manager, state) ? p : best
      );
      player.mentorId = mentor.card.id;
    }
  }

  manager.lockerRoom.push(player);
  removeFromManagerPending(state, managerId, playerId);
  log(state, managerId, "seat_player", { playerId, mentorId: player.mentorId || null });
  return player;
}


/**
 * Manager Board API
 *
 * These effects are the current reconstructed/prototype interpretation stored in
 * manager_boards.json. They are deliberately isolated behind explicit actions so
 * the digital UI can expose them later without embedding board logic in screens.
 */

/**
 * Staff ability API.
 *
 * The abilities are reconstructed prototype effects. Each is explicit, once per game,
 * and emits an audit event. UI code should call this API rather than mutate perkState.
 */
export function useStaffAbility(state, managerId, payload = {}) {
  const manager = getManager(state, managerId);
  const staff = manager.staff;
  assertRule(staff?.specialAbility, "NO_STAFF_ABILITY", "Manager has no usable Staff ability.");
  const ability = staff.specialAbility;
  const key = `staff:${ability.id}`;
  const uses = manager.perkState?.uses || (manager.perkState = {uses:{}}).uses;
  assertRule(!uses[key], "STAFF_ABILITY_USED", "This Staff ability has already been used.");

  let result;
  switch (ability.id) {
    case "reduce_upgrade_cost_100":
      manager.perkState.upgradeDiscount = (manager.perkState.upgradeDiscount || 0) + 100;
      result = { type: "upgrade_discount", amount: 100 };
      break;

    case "reveal_extra_event":
      assertPhase(state, "monday");
      assertRule(manager.mondayDraw?.length >= 3, "NO_MONDAY_DRAW", "Monday event draw is not ready.");
      manager.perkState.extraEventReveal = true;
      result = { type: "extra_event_reveal", available: true };
      break;

    case "ignore_one_injury_penalty":
      manager.perkState.injuryPenaltyImmunity = (manager.perkState.injuryPenaltyImmunity || 0) + 1;
      result = { type: "injury_penalty_immunity", charges: manager.perkState.injuryPenaltyImmunity };
      break;

    case "gain_100_instead_of_activity":
      assertRule(["saturday","sunday","deadline"].includes(state.day), "WRONG_PHASE", "Ability can only replace an activity.");
      manager.perkState.activityReplacementCash = (manager.perkState.activityReplacementCash || 0) + 100;
      result = { type: "activity_replacement", cash: 100 };
      break;

    case "shift_turn_order_one":
      assertRule(manager.perkState.turnOrderShifted !== true, "STAFF_ABILITY_USED", "Turn order shift already used.");
      const idx = state.turnOrder.indexOf(manager.id);
      assertRule(idx >= 0, "TURN_ORDER_ERROR", "Manager is not in turn order.");
      if (idx > 0) {
        [state.turnOrder[idx - 1], state.turnOrder[idx]] = [state.turnOrder[idx], state.turnOrder[idx - 1]];
      }
      manager.perkState.turnOrderShifted = true;
      result = { type: "turn_order_shift", managerId: manager.id };
      break;

    case "extra_target_role":
      manager.perkState.extraTargetRole = true;
      result = { type: "extra_target_role", enabled: true };
      break;

    case "protect_one_player":
      const target = manager.lockerRoom.find(p => p.card.id === payload.playerId);
      assertRule(target, "PLAYER_NOT_OWNED", "Protected player must be in the locker room.");
      manager.perkState.protectedPlayerId = target.card.id;
      result = { type: "player_protected", playerId: target.card.id };
      break;

    case "retrieve_discarded_event":
      assertRule(state.discardPile.length > 0, "DISCARD_EMPTY", "There is no discarded event to retrieve.");
      const wanted = payload.eventId
        ? state.discardPile.find(c => c.id === payload.eventId)
        : state.discardPile[state.discardPile.length - 1];
      assertRule(wanted, "EVENT_NOT_IN_DISCARD", "Selected event is not in the discard pile.");
      manager.eventHand.push(clone(wanted));
      state.discardPile = state.discardPile.filter(c => c.id !== wanted.id);
      result = { type: "event_retrieved", eventId: wanted.id };
      break;

    case "reduce_project_cost_100":
      manager.perkState.projectDiscount = (manager.perkState.projectDiscount || 0) + 100;
      result = { type: "project_discount", amount: 100 };
      break;

    case "refresh_one_auction_player":
      assertPhaseOpenAuction(state);
      const oldId = payload.playerId;
      const index = state.auction.players.findIndex(p => p.id === oldId);
      assertRule(index >= 0, "PLAYER_NOT_IN_AUCTION", "Selected player is not in the current auction.");
      const replacement = state.playerDeck.find(p =>
        !state.auction.players.some(a => a.id === p.id) &&
        !manager.availablePlayers.some(o => o.card.id === p.id) &&
        !manager.lockerRoom.some(o => o.card.id === p.id)
      );
      assertRule(replacement, "PLAYER_DECK_EMPTY", "No replacement player is available.");
      state.auction.players[index] = clone(replacement);
      result = { type: "auction_refresh", removedPlayerId: oldId, replacementPlayerId: replacement.id };
      break;

    default:
      assertRule(false, "UNKNOWN_STAFF_ABILITY", `Unknown Staff ability: ${ability.id}`);
  }

  uses[key] = true;
  log(state, manager.id, "staff_ability", { abilityId: ability.id, payload, result });
  return result;
}

export function getStaffAbilityStatus(state, managerId) {
  const manager = getManager(state, managerId);
  const ability = manager.staff?.specialAbility;
  if (!ability) return null;
  const used = Boolean(manager.perkState?.uses?.[`staff:${ability.id}`]);
  return { staffId: manager.staff.id, abilityId: ability.id, uses: ability.uses, used };
}

export function useManagerBoard(state, managerId, action, payload = {}) {
  const manager = getManager(state, managerId);
  const board = manager.managerBoard;
  assertRule(board, "NO_MANAGER_BOARD", "Manager has no Manager Board.");
  const uses = manager.perkState?.uses || (manager.perkState = { uses: {} }).uses;
  const perkId = board.perk?.id;
  assertRule(perkId, "INVALID_MANAGER_BOARD", "Manager Board has no perk definition.");

  const oncePerGame = board.perk.uses === "once_per_game";
  const oncePerWeek = board.perk.uses === "once_per_week";
  const key = `${perkId}:${action}`;
  if (oncePerGame || oncePerWeek) {
    assertRule(!uses[key], "BOARD_PERK_USED", "This Manager Board perk has already been used.");
  }

  let result;
  switch (perkId) {
    case "scouting_department":
      assertRule(action === "peek_next_player", "INVALID_BOARD_ACTION", "Invalid Scout action.");
      assertRule(state.playerDeck.length > 0, "PLAYER_DECK_EMPTY", "No player card remains to peek.");
      manager.lastPeek = clone(state.playerDeck[state.playerDeck.length - 1]);
      result = manager.lastPeek;
      break;

    case "tactical_director":
      assertRule(action === "swap_event_reveal", "INVALID_BOARD_ACTION", "Invalid Tactician action.");
      result = swapEventReveal(state, manager, payload.revealedEventId, payload.hiddenEventId);
      break;

    case "youth_development_office":
      assertRule(action === "set_talent_mentor", "INVALID_BOARD_ACTION", "Invalid Academy action.");
      result = setAcademyMentor(state, manager, payload.talentPlayerId, payload.mentorPlayerId);
      break;

    case "transfer_negotiator":
      assertRule(action === "auction_pass", "INVALID_BOARD_ACTION", "Invalid Negotiator action.");
      result = useNegotiatorPass(state, manager, payload.playerId);
      break;

    default:
      assertRule(false, "UNKNOWN_BOARD_PERK", `Unknown Manager Board perk: ${perkId}`);
  }

  if (oncePerGame || oncePerWeek) uses[key] = true;
  log(state, managerId, "manager_board_perk", { perkId, action, payload });
  return result;
}

function swapEventReveal(state, manager, revealedEventId, hiddenEventId) {
  assertPhase(state, "tuesday");
  const meta = manager.eventMeta || {};
  const revealed = manager.eventHand.find(c => c.id === revealedEventId);
  const hidden = manager.eventHand.find(c => c.id === hiddenEventId);
  assertRule(revealed && hidden, "EVENT_NOT_IN_HAND", "Both selected event cards must be in the manager's hand.");
  assertRule(meta[revealedEventId] === true, "EVENT_NOT_REVEALED", "First selected event must currently be revealed.");
  assertRule(meta[hiddenEventId] === false, "EVENT_NOT_HIDDEN", "Second selected event must currently be hidden.");
  meta[revealedEventId] = false;
  meta[hiddenEventId] = true;
  return { revealedEventId: hiddenEventId, hiddenEventId: revealedEventId };
}

function setAcademyMentor(state, manager, talentPlayerId, mentorPlayerId) {
  const talent = manager.lockerRoom.find(p => p.card.id === talentPlayerId);
  const mentor = manager.lockerRoom.find(p => p.card.id === mentorPlayerId);
  assertRule(talent?.card.rarity === "talent", "INVALID_TALENT", "Selected player must be a Talent.");
  assertRule(mentor && mentor.card.rarity !== "talent", "INVALID_MENTOR", "Selected mentor must be a non-Talent player.");
  talent.mentorId = mentor.card.id;
  return { talentPlayerId, mentorPlayerId };
}

function useNegotiatorPass(state, manager, playerId) {
  assertPhaseOpenAuction(state);
  assertRule(manager.managerBoard?.perk?.id === "transfer_negotiator", "INVALID_BOARD_ACTION", "Manager is not a Negotiator.");
  assertRule(state.auction.players.some(p => p.id === playerId), "PLAYER_NOT_IN_AUCTION", "Player is not in the current auction.");
  manager.perkState.negotiatorPassPlayerId = playerId;
  manager.perkState.negotiatorPassActive = true;
  return { playerId, active: true };
}

export function getBoardPerkStatus(state, managerId) {
  const manager = getManager(state, managerId);
  const board = manager.managerBoard;
  if (!board?.perk) return null;
  const uses = manager.perkState?.uses || {};
  const key = `${board.perk.id}:${board.perk.id === "scouting_department" ? "peek_next_player" :
    board.perk.id === "tactical_director" ? "swap_event_reveal" :
    board.perk.id === "youth_development_office" ? "set_talent_mentor" : "auction_pass"}`;
  return {
    boardId: board.id,
    boardName: board.name,
    perkId: board.perk.id,
    uses: board.perk.uses,
    used: Boolean(uses[key])
  };
}

export function getManager(state, managerId) {
  const manager = state.managers.find(m => m.id === managerId);
  assertRule(manager, "MANAGER_NOT_FOUND", `Unknown manager: ${managerId}`);
  return manager;
}

export function getCurrentManager(state) {
  assertRule(state.currentManagerId, "NO_CURRENT_MANAGER", "No manager currently has priority.");
  return getManager(state, state.currentManagerId);
}

export function assertPhase(state, expectedDay) {
  assertRule(state.day === expectedDay, "WRONG_PHASE",
    `Action is only valid during ${expectedDay}; current phase is ${state.day}.`);
}

export function advanceDay(state) {
  const i = DAYS.indexOf(state.day);
  assertRule(i >= 0 && i < DAYS.length - 1, "GAME_OVER", "Game has already ended.");
  state.day = DAYS[i + 1];

  if (state.day === "saturday" || state.day === "sunday") {
    state.auction = freshAuctionState();
  }
  if (state.day === "monday") {
    state.eventSystem.mondayResolved = false;
  }
  log(state, null, "advance_day", { day: state.day });
  return state.day;
}

export function freshAuctionState() {
  return {
    status: "closed",
    players: [],
    bids: {},
    committedManagers: {},
    winner: null,
    currentPlayerId: null,
    lastBidManagerId: null,
    lastBidAmount: 0
  };
}

export function startAuction(state, playerIds) {
  assertRule(["saturday", "sunday", "deadline"].includes(state.day),
    "WRONG_PHASE", "Auctions can only start on Saturday, Sunday or Deadline Day.");
  assertRule(playerIds.length === 3, "INVALID_MARKET_SIZE", "A standard auction requires exactly three players.");
  const cards = playerIds.map(id => {
    const p = state.content.players.find(x => x.id === id);
    assertRule(p, "PLAYER_NOT_FOUND", `Unknown player card: ${id}`);
    return p;
  });
  state.auction = {
    ...freshAuctionState(),
    status: "open",
    players: cards,
    currentPlayerId: null
  };
  // Market cards leave the deck when the market opens; otherwise the same
  // card could be offered again in a later auction.
  state.playerDeck = state.playerDeck.filter(p => !playerIds.includes(p.id));
  log(state, null, "start_auction", { playerIds });
}

export function bid(state, managerId, playerId, amount) {
  assertPhaseOpenAuction(state);
  const manager = getManager(state, managerId);
  const player = state.auction.players.find(p => p.id === playerId);
  assertRule(player, "PLAYER_NOT_IN_AUCTION", "Player is not in the current auction.");
  assertRule(!state.auction.committedManagers[`${managerId}:${playerId}`],
    "ALREADY_BID_PLAYER", "A manager may bid only once on a given player.");
  assertRule(Number.isInteger(amount) && amount >= 0, "INVALID_BID", "Bid must be a non-negative integer.");
  const current = state.auction.bids[playerId] || 0;
  const committedTotal = Object.entries(state.auction.committedManagers)
    .filter(([key]) => key.startsWith(`${managerId}:`))
    .reduce((sum,[key]) => sum + (state.auction.bids[key.split(":")[1]] || 0), 0);
  const oldCommitment = state.auction.committedManagers[`${managerId}:${playerId}`]
    ? current : 0;
  const availableForNewBid = manager.cash - committedTotal + oldCommitment;
  assertRule(availableForNewBid >= amount, "INSUFFICIENT_CASH",
    "Manager cannot commit more auction cash than available.");


  const min = current ? current + 100 : baseAuctionPrice(state, player);
  assertRule(amount >= min, "BID_TOO_LOW", `Minimum valid bid is ${min}.`);

  state.auction.bids[playerId] = amount;
  state.auction.committedManagers[`${managerId}:${playerId}`] = true;
  state.auction.lastBidManagerId = managerId;
  state.auction.lastBidAmount = amount;
  state.currentManagerId = managerId;

  log(state, managerId, "bid", { playerId, amount });
  return amount;
}

export function resolveAuction(state) {
  assertPhaseOpenAuction(state);
  for (const player of state.auction.players) {
    const bidEntries = Object.entries(state.auction.committedManagers)
      .filter(([key]) => key.endsWith(`:${player.id}`))
      .map(([key]) => ({ managerId: key.split(":")[0], amount: state.auction.bids[player.id] }));

    if (!bidEntries.length) continue;

    bidEntries.sort((a, b) => b.amount - a.amount);
    const winner = bidEntries[0];
    const manager = getManager(state, winner.managerId);
    assertRule(manager.cash >= winner.amount, "INSUFFICIENT_CASH", "Winner can no longer afford the winning bid.");
    manager.cash -= winner.amount;

    const owned = {
      card: clone(player),
      injuryId: null,
      upgrades: [],
      mentorId: null
    };
    manager.availablePlayers = manager.availablePlayers || [];
    manager.availablePlayers.push(owned);
    state.auction.winner = { playerId: player.id, managerId: winner.managerId, amount: winner.amount };
  }

  state.auction.status = "closed";
  state.auction.players = [];
  log(state, null, "resolve_auction", {});
}

export function baseAuctionPrice(state, player) {
  const r = state.content.rarity.rarities.find(x => x.id === player.rarity);
  assertRule(r, "RARITY_NOT_FOUND", `Unknown rarity: ${player.rarity}`);
  return r.baseAuctionPrice;
}

function assertPhaseOpenAuction(state) {
  assertRule(["saturday", "sunday", "deadline"].includes(state.day),
    "WRONG_PHASE", "Not an auction phase.");
  assertRule(state.auction.status === "open", "AUCTION_CLOSED", "No auction is currently open.");
}

export function chooseActivity(state, managerId, activity) {
  assertRule(["saturday", "sunday", "deadline"].includes(state.day),
    "WRONG_PHASE", "Activities are available during auction days.");
  const manager = getManager(state, managerId);

  if (manager.perkState?.activityReplacementCash > 0 && activity === "use_staff_activity_replacement") {
    manager.cash += manager.perkState.activityReplacementCash;
    manager.perkState.activityReplacementCash = 0;
    log(state, managerId, "staff_activity_replacement", { cash: 100 });
    return { cash: 100 };
  }
  if (activity === "intense_gym") manager.trainingLevel = Math.min(8, manager.trainingLevel + 1);
  else if (activity === "friendly_match") {
    assertRule(manager.cash >= 100, "INSUFFICIENT_CASH", "Friendly Match costs 100.");
    manager.cash -= 100;
    manager.trainingLevel = Math.min(8, manager.trainingLevel + 2);
  } else if (activity === "season_ticket_sale") {
    manager.cash += 300;
  } else if (activity === "finish_sauna") {
    const injured = manager.lockerRoom.find(p => p.injuryId);
    assertRule(injured, "NO_INJURED_PLAYER", "No injured player is available to heal.");
    injured.injuryId = null;
  } else {
    assertRule(false, "UNKNOWN_ACTIVITY", `Unknown activity: ${activity}`);
  }

  log(state, managerId, "activity", { activity });
}

export function mondayDeal(state, stacksByManager) {
  assertPhase(state, "monday");
  for (const manager of state.managers) {
    const stack = stacksByManager[manager.id];
    assertRule(Array.isArray(stack) && stack.length === 3,
      "INVALID_EVENT_STACK", "Each manager needs a 3-card Monday stack.");
    assertRule(stack.filter(x => x.revealed).length === 1,
      "INVALID_EVENT_STACK", "Exactly one card must be revealed.");
    manager.eventHand.push(...stack.map(x => clone(x.card)));
    manager.eventMeta = Object.fromEntries(stack.map(x => [x.card.id, Boolean(x.revealed)]));
  }
  state.eventSystem.mondayResolved = true;
  log(state, null, "monday_deal", {});
}

export function playEvent(state, managerId, eventId, target = {}) {
  assertPhase(state, "tuesday");
  const manager = getManager(state, managerId);
  const index = manager.eventHand.findIndex(c => c.id === eventId);
  assertRule(index >= 0, "EVENT_NOT_IN_HAND", "Event card is not in manager hand.");
  const card = manager.eventHand[index];

  switch (card.category) {
    case "upgrade": return playUpgrade(state, manager, card, target);
    case "injury": return playInjury(state, manager, card, target);
    case "healing": return playHealing(state, manager, card, target);
    case "project": return playProject(state, manager, card);
    case "training": return playTrainingCard(state, manager, card);
    case "leadership_blunder":
      assertRule(false, "BLUNDER_NOT_PLAYABLE", "Leadership Blunders are revealed immediately and are not voluntarily played.");
    case "wildcard":
    case "sabotage":
      return playSpecialEvent(state, manager, card, target);
    default:
      assertRule(false, "UNKNOWN_EVENT", `Unknown event category: ${card.category}`);
  }
}

function playUpgrade(state, manager, card, target) {
  const p = manager.lockerRoom.find(x => x.card.id === target.playerId);
  assertRule(p, "PLAYER_NOT_OWNED", "Upgrade target must be in the locker room.");
  assertRule(!p.injuryId, "INJURED_PLAYER", "Injured players cannot receive upgrades.");
  assertRule(p.upgrades.length < p.card.upgradeCapacity, "UPGRADE_CAPACITY",
    "Player has no upgrade capacity left.");
  assertRule(!p.upgrades.some(u => u.category === card.category), "UPGRADE_CATEGORY_DUPLICATE",
    "A player cannot have two upgrades from the same category.");
  assertRule(manager.trainingLevel >= (card.requirements?.minimumTraining || 0),
    "TRAINING_TOO_LOW", "Training Level is too low for this upgrade.");

  const rawCost = card.activationCost || card.cost || 0;
  const discount = manager.perkState?.upgradeDiscount || 0;
  const waiver = manager.perkState?.costWaiver || 0;
  const waived = Math.min(waiver, Math.max(0, rawCost - discount));
  const upgradeCost = Math.max(0, rawCost - discount - waived);
  assertRule(manager.cash >= upgradeCost, "INSUFFICIENT_CASH", "Cannot afford this upgrade.");
  manager.cash -= upgradeCost;
  manager.perkState.costWaiver = Math.max(0, waiver - waived);
  manager.perkState.upgradeDiscount = Math.max(0, discount - rawCost);
  p.upgrades.push(clone(card));
  consumeEvent(state, manager, card);
  log(state, manager.id, "play_upgrade", { eventId: card.id, playerId: p.card.id });
  return p;
}

function playInjury(state, manager, card, target) {
  const opponent = getManager(state, target.managerId);
  assertRule(opponent.id !== manager.id, "INVALID_TARGET", "Injury must target an opponent.");
  const p = opponent.lockerRoom.find(x => x.card.id === target.playerId);
  assertRule(p, "PLAYER_NOT_FOUND", "Target player not found.");
  assertRule(!p.injuryId, "ALREADY_INJURED", "A player can have only one injury.");
  p.injuryId = card.id;
  consumeEvent(state, manager, card);
  log(state, manager.id, "play_injury", { eventId: card.id, targetManagerId: opponent.id, playerId: p.card.id });
  return p;
}

function playHealing(state, manager, card, target) {
  const p = manager.lockerRoom.find(x => x.card.id === target.playerId);
  assertRule(p?.injuryId, "NO_INJURY", "Selected player is not injured.");
  p.injuryId = null;
  consumeEvent(state, manager, card);
  log(state, manager.id, "play_healing", { eventId: card.id, playerId: p.card.id });
  return p;
}

function playProject(state, manager, card) {
  const rawCost = manager.trainingLevel >= 6 ? 0 : card.activationCost;
  const discount = manager.perkState?.projectDiscount || 0;
  const waiver = manager.perkState?.costWaiver || 0;
  const waived = Math.min(waiver, Math.max(0, rawCost - discount));
  const cost = Math.max(0, rawCost - discount - waived);
  assertRule(manager.cash >= cost, "INSUFFICIENT_CASH", "Cannot afford this project.");
  manager.cash -= cost;
  manager.perkState.costWaiver = Math.max(0, waiver - waived);
  manager.perkState.projectDiscount = Math.max(0, discount - rawCost);
  manager.projectPrestige += card.prestigeReward;
  consumeEvent(state, manager, card);
  log(state, manager.id, "play_project", { eventId: card.id, cost });
  return card;
}

function playTrainingCard(state, manager, card) {
  const penalty = manager.trainingPenaltyNext || 0;
  const gain = Math.max(0, card.trainingGain - penalty);
  manager.trainingPenaltyNext = 0;
  manager.trainingLevel = Math.min(8, manager.trainingLevel + gain);
  consumeEvent(state, manager, card);
  log(state, manager.id, "play_training_card", { eventId: card.id });
  return card;
}

function playSpecialEvent(state, manager, card, target) {
  if (card.effect === "look_at_one_discarded_event") {
    manager.lastPeek = state.discardPile?.length
      ? clone(state.discardPile[state.discardPile.length - 1])
      : null;
  } else if (card.effect === "waive_100_of_one_cost") {
    manager.perkState.costWaiver = (manager.perkState.costWaiver || 0) + 100;
  } else if (card.effect === "opponent_reveals_one_hidden_event") {
    const opponent = getManager(state, target.managerId);
    assertRule(opponent.id !== manager.id, "INVALID_TARGET", "Sabotage must target an opponent.");
    const hidden = opponent.eventHand.find(c => opponent.eventMeta?.[c.id] === false);
    assertRule(hidden, "NO_HIDDEN_EVENT", "Opponent has no hidden event.");
    opponent.eventMeta[hidden.id] = true;
    opponent.lastForcedReveal = hidden.id;
  } else if (card.effect === "opponent_loses_one_next_training_gain") {
    const opponent = getManager(state, target.managerId);
    assertRule(opponent.id !== manager.id, "INVALID_TARGET", "Sabotage must target an opponent.");
    opponent.trainingPenaltyNext = (opponent.trainingPenaltyNext || 0) + 1;
  } else if (card.effect === "opponent_reveals_one_target_condition") {
    const opponent = getManager(state, target.managerId);
    assertRule(opponent.id !== manager.id, "INVALID_TARGET", "Sabotage must target an opponent.");
    opponent.targetRevealedTo = manager.id;
  } else if (card.effect === "reroute_one_own_event_target") {
    assertRule(target.fromManagerId && target.toManagerId, "INVALID_REROUTE", "Reroute needs from/to targets.");
    manager.perkState.reroute = {fromManagerId: target.fromManagerId, toManagerId: target.toManagerId};
  } else if (card.effect === "change_one_own_side_activity_choice") {
    assertRule(target.activity, "INVALID_ACTIVITY", "A replacement activity is required.");
    manager.perkState.activityOverride = target.activity;
  } else {
    assertRule(false, "UNKNOWN_SPECIAL_EFFECT", `Unsupported special event effect: ${card.effect}`);
  }
  consumeEvent(state, manager, card);
  log(state, manager.id, "play_special_event", { eventId: card.id, target });
  return card;
}

function discardEvent(state, card) {
  if (!state.discardPile) state.discardPile = [];
  state.discardPile.push(clone(card));
}

function consumeEvent(state, manager, card) {
  removeCard(manager, card.id);
  discardEvent(state, card);
}

function removeCard(manager, eventId) {
  const idx = manager.eventHand.findIndex(c => c.id === eventId);
  if (idx >= 0) manager.eventHand.splice(idx, 1);
}

export function sellPlayer(state, managerId, playerId) {
  assertPhase(state, "wednesday");
  const manager = getManager(state, managerId);
  const idx = manager.lockerRoom.findIndex(p => p.card.id === playerId);
  assertRule(idx >= 0, "PLAYER_NOT_FOUND", "Player is not in the locker room.");
  const p = manager.lockerRoom[idx];
  assertRule(!p.injuryId, "INJURED_PLAYER", "Injured players cannot be sold.");

  const saleValue = (getBasePrestige(p, manager, state) +
    p.upgrades.reduce((s, u) => s + (u.prestige || 0), 0)) * 100;

  manager.cash += saleValue;
  manager.lockerRoom.splice(idx, 1);
  manager.soldPlayers.push(p);
  log(state, managerId, "sell_player", { playerId, saleValue });
  return saleValue;
}

export function healAtPhysio(state, managerId, playerId) {
  assertPhase(state, "wednesday");
  const manager = getManager(state, managerId);
  assertRule(manager.trainingLevel >= 4, "TRAINING_TOO_LOW", "Physio Clinic requires Training Level 4.");
  assertRule(manager.cash >= 300, "INSUFFICIENT_CASH", "Physio Clinic costs 300.");
  const p = manager.lockerRoom.find(x => x.card.id === playerId);
  assertRule(p?.injuryId, "NO_INJURY", "Player is not injured.");
  manager.cash -= 300;
  p.injuryId = null;
  log(state, managerId, "physio", { playerId });
}

export function recalculateTurnOrder(state) {
  assertPhase(state, "thursday");
  const ranking = state.managers.map(m => ({
    id: m.id,
    players: m.lockerRoom.length,
    training: m.trainingLevel,
    score: m.lockerRoom.reduce((s, p) => s + getPlayerPrestige(p, m, state), 0),
    best: m.lockerRoom.length ? Math.max(...m.lockerRoom.map(p => getPlayerPrestige(p, m, state))) : 0,
    age: m.lockerRoom.reduce((s, p) => s + p.card.age, 0),
    dna: m.lockerRoom.filter(p => p.card.dna === m.clubDNA).length
  }));

  ranking.sort((a, b) =>
    b.players - a.players ||
    b.training - a.training ||
    b.score - a.score ||
    b.best - a.best ||
    b.age - a.age
  );

  state.turnOrder = ranking.map(x => x.id);
  state.currentManagerId = state.turnOrder[0] || null;
  log(state, null, "recalculate_turn_order", { turnOrder: state.turnOrder });
  return state.turnOrder;
}


/**
 * Sponsor side-task engine.
 * Reconstructed prototype effects: each completed side task pays 100 cash in addition
 * to the sponsor's fixed weekly payment. The task is evaluated from live manager state.
 */
export function evaluateSponsorTask(state, managerId, week = state.week) {
  const manager = getManager(state, managerId);
  const sponsor = manager.sponsor;
  assertRule(sponsor, "NO_SPONSOR", "Manager has no sponsor.");
  const plan = sponsor[`week${week}`];
  if (!plan?.sideTask) return { available: false, completed: false, reward: 0 };

  const task = plan.sideTask;
  const completed = checkSponsorTask(manager, task);
  const key = `sponsor:${sponsor.id}:week${week}`;
  const alreadyPaid = Boolean(manager.perkState?.uses?.[key]);
  const reward = completed && !alreadyPaid ? 100 : 0;

  return {
    available: true,
    type: task.type,
    value: task.value,
    completed,
    reward,
    alreadyPaid
  };
}

export function claimSponsorTask(state, managerId, week = state.week) {
  assertPhase(state, "friday");
  const manager = getManager(state, managerId);
  const result = evaluateSponsorTask(state, managerId, week);
  assertRule(result.available, "NO_SPONSOR_TASK", "No sponsor task is available for this week.");
  assertRule(result.completed, "SPONSOR_TASK_INCOMPLETE", "Sponsor side task has not been completed.");
  assertRule(!result.alreadyPaid, "SPONSOR_TASK_ALREADY_CLAIMED", "Sponsor side task has already been claimed.");

  const key = `sponsor:${manager.sponsor.id}:week${week}`;
  manager.cash += result.reward;
  manager.perkState.uses[key] = true;
  log(state, managerId, "sponsor_task_claimed", {
    sponsorId: manager.sponsor.id,
    week,
    task: result.type,
    reward: result.reward
  });
  return { ...result, claimed: true };
}

function checkSponsorTask(manager, task) {
  switch (task.type) {
    case "minimum_players":
      return manager.lockerRoom.length >= task.value;
    case "minimum_training":
      return manager.trainingLevel >= task.value;
    case "minimum_cash":
      return manager.cash >= task.value;
    case "minimum_matching_dna":
      return manager.lockerRoom.filter(p => p.card.dna === manager.clubDNA).length >= task.value;
    case "minimum_specialists":
      return manager.lockerRoom.filter(p => Boolean(p.card.role)).length >= task.value;
    case "minimum_nationality_pair": {
      const counts = new Map();
      for (const p of manager.lockerRoom) {
        counts.set(p.card.nationality, (counts.get(p.card.nationality) || 0) + 1);
      }
      return [...counts.values()].some(n => n >= 2);
    }
    case "minimum_upgrades":
      return manager.lockerRoom.reduce((n,p) => n + p.upgrades.length, 0) >= task.value;
    case "minimum_projects":
      return (manager.completedProjects?.length || 0) >= task.value;
    default:
      return false;
  }
}

export function payday(state) {
  assertPhase(state, "friday");
  for (const m of state.managers) {
    if (state.week <= 2) {
      m.cash += 500;
      if (m.sponsor?.week1?.sideTask) {
        // Sponsor side tasks are evaluated by the scoring/side-task layer.
        // v0.1 does not auto-grant uncertain publisher-specific task wording.
      }
    } else if (state.week === 3) {
      m.cash += m.trainingLevel * 100;
    }
  }
  log(state, null, "payday", { week: state.week });
}

export function calculateFinalScore(state, managerId) {
  const m = getManager(state, managerId);

  const playerScore = m.lockerRoom.reduce((s, p) => s + getPlayerPrestige(p, m, state), 0);

  const dnaCount = m.lockerRoom.filter(p => p.card.dna === m.clubDNA).length;
  const dnaCurve = state.balance?.dnaCurve || null;
  const dnaScore = dnaCurve
    ? (dnaCurve[Math.min(dnaCount, 4)] ?? 0)
    : (state.content.dna.own[String(Math.min(dnaCount, 4))] ?? 0);

  const opponentDnaPenalty = state.managers
    .filter(x => x.id !== m.id)
    .reduce((sum, opp) => sum - 3 * opp.lockerRoom.filter(p => p.card.dna === m.clubDNA).length, 0);

  const nationalityCounts = {};
  for (const p of m.lockerRoom) nationalityCounts[p.card.nationality] =
    (nationalityCounts[p.card.nationality] || 0) + 1;
  const compatriotMultiplier = state.balance?.compatriotMultiplier ?? 7;
  const compatriotScore = Object.values(nationalityCounts)
    .filter(n => n >= 2).length * compatriotMultiplier;

  const ages = m.lockerRoom.map(p => p.card.age);
  const ageScore = ages.length === 4 && isStrictlyAscending(ages) ? 10 : 0;

  const budgetDivisor = state.balance?.budgetDivisor ?? 100;
  const budgetScore = Math.floor(m.cash / budgetDivisor);
  const soldMultiplier = state.balance?.soldPlayerMultiplier ?? 3;
  const soldScore = m.trainingLevel >= 5 ? m.soldPlayers.length * soldMultiplier : 0;
  const targetScore = m.targetScore || 0;

  const staffCaptain = m.staffCaptainScore || 0;
  const project = m.projectPrestige || 0;
  const trophy = m.trainingTrophyPrestige || 0;
  const blunderPenalty = m.leadershipBlunders.reduce(
    (s, b) => s + Math.abs(b.prestigePenalty || 0), 0
  );

  const board = state.balance?.managerBoardPerks || {};
  const perk = board[m.strategy] || {};
  let managerBoardScore = perk.flat || 0;
  if (m.strategy === "aggressive" && perk.auctionSpendDivisor) {
    managerBoardScore += Math.floor((m.aiAuctionSpend || 0) / perk.auctionSpendDivisor) * (perk.auctionSpendBonus || 0);
  }
  if (m.strategy === "target_hunter" && targetScore > 0) {
    managerBoardScore += perk.targetCompleteBonus || 0;
  }
  if (m.strategy === "dna_specialist") {
    managerBoardScore += Math.round(dnaScore * (perk.dnaMultiplier || 0));
  }

  const breakdown = {
    players: playerScore,
    staffCaptain,
    budget: budgetScore,
    projects: project,
    trainingTrophy: trophy,
    soldPlayers: soldScore,
    leadershipBlunders: -blunderPenalty,
    squadAge: ageScore,
    compatriots: compatriotScore,
    clubDNA: dnaScore + opponentDnaPenalty,
    transferTarget: targetScore,
    managerBoard: managerBoardScore
  };

  return {
    ...breakdown,
    total: Object.values(breakdown).reduce((s, v) => s + v, 0)
  };
}

function isStrictlyAscending(values) {
  if (values.length !== 4) return false;
  for (let i = 1; i < values.length; i++) {
    if (values[i] <= values[i - 1]) return false;
  }
  return true;
}

export function evaluateTransferTarget(state, managerId) {
  const m = getManager(state, managerId);
  const target = m.transferTarget;
  assertRule(target, "NO_TRANSFER_TARGET", "Manager has no Transfer Target.");

  const counts = {};
  for (const p of m.lockerRoom) counts[p.card.position] = (counts[p.card.position] || 0) + 1;

  const requiredPositions = (target.requiredPlayers || []).every(req =>
    (counts[req.position] || 0) >= req.count
  );

  const roleSet = new Set(m.lockerRoom.map(p => p.card.role).filter(Boolean));
  const roleComplete = !target.requiredRole || roleSet.has(target.requiredRole);

  const specialistBonus = roleComplete
    ? (target.specialistBonuses || [])
        .filter(x => x.role === target.requiredRole)
        .reduce((s, x) => s + (x.reward || 0), 0)
    : 0;

  const required = requiredPositions && roleComplete;
  const completionCost = target.completionCost || 0;
  const canPay = m.cash >= completionCost;
  const score = required && canPay ? (target.mainReward || 0) + specialistBonus : 0;
  if (score > 0 && completionCost) m.cash -= completionCost;
  m.targetScore = score;

  return { completed: required, specialistBonus, score };
}

export function resolveTrainingTrophy(state) {
  assertRule(state.day === "thursday" || state.day === "final_scoring",
    "WRONG_PHASE", "Training Trophy is resolved at the end of the training cycle.");

  const eligible = state.managers.filter(m => m.trainingLevel >= 8);
  state.trainingTrophyOwner = null;
  for (const m of state.managers) m.trainingTrophyPrestige = 0;

  if (!eligible.length) return null;

  eligible.sort((a,b) => {
    const pA = a.lockerRoom.reduce((s,p) => s + getPlayerPrestige(p,a,state),0);
    const pB = b.lockerRoom.reduce((s,p) => s + getPlayerPrestige(p,b,state),0);
    return b.trainingLevel-a.trainingLevel || pB-pA || a.id.localeCompare(b.id);
  });

  const winner = eligible[0];
  winner.trainingTrophyPrestige = state.content.training.trainingTrophyPrestige || 10;
  state.trainingTrophyOwner = { managerId: winner.id };
  log(state, winner.id, "training_trophy", { prestige: winner.trainingTrophyPrestige });
  return winner.id;
}


function findOwnedOrAvailablePlayer(state, managerId, playerId) {
  const manager = getManager(state, managerId);
  const existing = manager.availablePlayers?.find(p => p.card.id === playerId);
  if (existing) return existing;

  const deckCard = state.content.players.find(p => p.id === playerId);
  assertRule(deckCard, "PLAYER_NOT_FOUND", `Unknown player: ${playerId}`);
  return { card: clone(deckCard), injuryId: null, upgrades: [], mentorId: null };
}

function removeFromManagerPending(state, managerId, playerId) {
  const m = getManager(state, managerId);
  if (m.availablePlayers) {
    const i = m.availablePlayers.findIndex(p => p.card.id === playerId);
    if (i >= 0) m.availablePlayers.splice(i, 1);
  }
}

export function log(state, managerId, action, payload) {
  state.auditLog.push({
    at: new Date().toISOString(),
    managerId,
    action,
    payload
  });
}
