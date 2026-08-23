
const json = (url) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`Content load failed: ${r.status} ${url}`);
  return r.json();
});

export async function loadContentBrowser(base = "./content") {
  const [
    config, manifest, reconstructionPolicy,
    boards, players, sponsors, staff, targets,
    dnaScoring, finalScoring, positions, rarity, trainingLevels,
    healing, injuries, leadershipBlunders, projects,
    sabotages, training, upgrades, wildcards
  ] = await Promise.all([
    json(`${base}/game_config.json`),
    json(`${base}/content_manifest.json`),
    json(`${base}/reconstruction_policy.json`),
    json(`${base}/manager_boards.json`),
    json(`${base}/players.json`),
    json(`${base}/sponsors.json`),
    json(`${base}/staff.json`),
    json(`${base}/transfer_targets.json`),
    json(`${base}/rules/dna_scoring.json`),
    json(`${base}/rules/final_scoring.json`),
    json(`${base}/rules/positions.json`),
    json(`${base}/rules/rarity.json`),
    json(`${base}/rules/training_levels.json`),
    json(`${base}/events/healing.json`),
    json(`${base}/events/injuries.json`),
    json(`${base}/events/leadership_blunders.json`),
    json(`${base}/events/projects.json`),
    json(`${base}/events/sabotages.json`),
    json(`${base}/events/training.json`),
    json(`${base}/events/upgrades.json`),
    json(`${base}/events/wildcards.json`)
  ]);

  // Preserve the engine's expected content shape.
  return {
    config,
    manifest,
    reconstructionPolicy,
    boards: boards.records ?? boards,
    players: players.records ?? players,
    sponsors: sponsors.records ?? sponsors,
    staff: staff.records ?? staff,
    targets: targets.records ?? targets,
    dnaScoring,
    finalScoring,
    positions,
    rarity,
    trainingLevels,
    events: {
      healing: healing.records ?? healing,
      injuries: injuries.records ?? injuries,
      leadershipBlunders: leadershipBlunders.records ?? leadershipBlunders,
      projects: projects.records ?? projects,
      sabotages: sabotages.records ?? sabotages,
      training: training.records ?? training,
      upgrades: upgrades.records ?? upgrades,
      wildcards: wildcards.records ?? wildcards
    }
  };
}
