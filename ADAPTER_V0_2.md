# PITCHERA Adapter v0.2

The adapter is now an explicit command boundary. It no longer expects a nonexistent
`state.commands` object.

## Supported commands
start, nextDay, finishWeek, startAuction, bid, resolveAuction, seatPlayer,
chooseActivity, mondayDeal, playEvent, sellPlayer, healAtPhysio,
recalculateTurnOrder, evaluateSponsorTask, claimSponsorTask, payday,
calculateFinalScore, evaluateTransferTarget, resolveTrainingTrophy,
useStaffAbility, getStaffAbilityStatus, useManagerBoard, getBoardPerkStatus,
useManagerPerk.

The PWA should dispatch commands only through `PitcheraGameController.dispatch()`.

## Important
The rules engine currently mutates GameState in place. The adapter centralizes this access
and validates the state after every mutating command.
