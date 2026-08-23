
export function validateState(state) {
  const errors = [];
  if (!["rookie","full"].includes(state.mode)) errors.push("invalid mode");
  if (state.playerCount < 2 || state.playerCount > 4) errors.push("invalid player count");
  if (state.managers.length !== state.playerCount) errors.push("manager count mismatch");

  for (const m of state.managers) {
    if (m.lockerRoom.length > 4) errors.push(`${m.id}: locker room > 4`);
    if (m.trainingLevel < 0 || m.trainingLevel > 8) errors.push(`${m.id}: invalid training`);
    if (m.cash < 0) errors.push(`${m.id}: negative cash`);
    const ids = m.lockerRoom.map(p => p.card.id);
    if (new Set(ids).size !== ids.length) errors.push(`${m.id}: duplicate locker player`);
  }

  if (state.auction.status === "open" && state.auction.players.length !== 3) {
    errors.push("open auction does not contain exactly three players");
  }

  return { valid: errors.length === 0, errors };
}
