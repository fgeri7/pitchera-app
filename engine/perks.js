
import { assertRule } from "./errors.js";
import { getManager } from "./rules.js";

export function useManagerPerk(state, managerId, payload = {}) {
  const m = getManager(state, managerId);
  assertRule(m.perkState.enabled, "PERKS_DISABLED", "Manager Board perks are disabled in this mode.");
  const perk = m.managerBoard?.perk;
  assertRule(perk, "NO_PERK", "Manager has no Manager Board perk.");

  const used = m.perkState.uses[perk.id] || 0;

  if (perk.id === "scouting_department") {
    assertRule(used < 4, "PERK_EXHAUSTED", "Scouting Department has been used four times.");
    assertRule(state.playerDeck.length > 0, "EMPTY_PLAYER_DECK", "Player deck is empty.");
    m.lastScoutPeek = state.playerDeck[0];
    m.perkState.uses[perk.id] = used + 1;
    return m.lastScoutPeek;
  }

  assertRule(used < 1, "PERK_EXHAUSTED", "This Manager Board perk has already been used.");

  if (perk.id === "tactical_director") {
    assertRule(state.day === "monday", "WRONG_PHASE", "Tactical Director can be used on Monday.");
    assertRule(Array.isArray(m.mondayDraw) && m.mondayDraw.length === 3,
      "NO_MONDAY_STACK", "Manager does not have a Monday stack.");
    m.mondayDraw[0].revealed = !m.mondayDraw[0].revealed;
    m.mondayDraw[1].revealed = !m.mondayDraw[1].revealed;
  }

  if (perk.id === "youth_development_office") {
    assertRule(payload.talentId && payload.mentorId, "MISSING_MENTOR_SELECTION",
      "Talent and mentor are required.");
    const talent = m.lockerRoom.find(p => p.card.id === payload.talentId);
    const mentor = m.lockerRoom.find(p => p.card.id === payload.mentorId);
    assertRule(talent?.card.rarity === "talent", "INVALID_TALENT", "Target must be a Talent.");
    assertRule(mentor && mentor.card.rarity !== "talent", "INVALID_MENTOR", "Mentor must not be a Talent.");
    talent.mentorId = mentor.card.id;
  }

  if (perk.id === "transfer_negotiator") {
    assertRule(state.auction.status === "open", "NO_AUCTION", "No auction is open.");
    assertRule(state.auction.lastBidManagerId !== managerId,
      "NOT_OVERBID", "The perk can only be used after another manager overbids you.");
    m.perkState.auctionPass = true;
  }

  m.perkState.uses[perk.id] = used + 1;
  return true;
}
