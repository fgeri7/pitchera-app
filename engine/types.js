
/**
 * Runtime data shapes are documented here with JSDoc rather than TypeScript
 * so the engine runs with stock Node.js and has zero runtime dependencies.
 */

/**
 * @typedef {Object} PlayerCard
 * @property {string} id
 * @property {string} name
 * @property {number|null} basePrestige
 * @property {string} rarity
 * @property {"defender"|"midfielder"|"forward"} position
 * @property {string|null} role
 * @property {string} nationality
 * @property {number} age
 * @property {string} dna
 * @property {number} upgradeCapacity
 */

/**
 * @typedef {Object} PlayerState
 * @property {PlayerCard} card
 * @property {string|null} injuryId
 * @property {Array<Object>} upgrades
 * @property {string|null} mentorId
 */

/**
 * @typedef {Object} ManagerState
 * @property {string} id
 * @property {string} name
 * @property {number} cash
 * @property {number} trainingLevel
 * @property {string|null} clubDNA
 * @property {Object|null} sponsor
 * @property {Object|null} staff
 * @property {Object|null} transferTarget
 * @property {PlayerState[]} lockerRoom
 * @property {PlayerState[]} soldPlayers
 * @property {Object[]} eventHand
 * @property {Object[]} leadershipBlunders
 * @property {Object} perkState
 * @property {number} projectPrestige
 * @property {number} trainingTrophyPrestige
 */

/**
 * @typedef {Object} GameState
 * @property {string} gameId
 * @property {"rookie"|"full"} mode
 * @property {number} playerCount
 * @property {number} week
 * @property {"setup"|"saturday"|"sunday"|"monday"|"tuesday"|"wednesday"|"thursday"|"friday"|"deadline"|"final_scoring"|"finished"} day
 * @property {string[]} turnOrder
 * @property {string|null} currentManagerId
 * @property {Object} auction
 * @property {Object} eventSystem
 * @property {ManagerState[]} managers
 * @property {Object[]} playerDeck
 * @property {Object[]} discardPile
 * @property {Object|null} trainingTrophyOwner
 * @property {Object[]} auditLog
 */
