
const json = (url) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`Content load failed: ${r.status} ${url}`);
  return r.json();
});

export async function loadContentBrowser(base = "./content") {
  const [
    config, manifest, reconstructionPolicy,
    boards, players, sponsors, staff, targets,
    dna, finalScoring, positions, rarity, trainingLevels,
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

  const unwrap = x => x?.records ?? x?.boards ?? x?.items ?? x;

  return {
    config,
    manifest,
    reconstructionPolicy,
    boards: unwrap(boards),
    players: unwrap(players),
    sponsors: unwrap(sponsors),
    staff: unwrap(staff),
    targets: unwrap(targets),
    dna,
    finalScoring,
    positions,
    rarity,
    trainingLevels,
    events: {
      healing: unwrap(healing),
      injuries: unwrap(injuries),
      blunders: unwrap(leadershipBlunders),
      leadershipBlunders: unwrap(leadershipBlunders),
      projects: unwrap(projects),
      sabotages: unwrap(sabotages),
      training: unwrap(training),
      upgrades: unwrap(upgrades),
      wildcards: unwrap(wildcards)
    }
  };
}
