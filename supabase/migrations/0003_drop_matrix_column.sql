-- Drop cities.matrix (the legacy hand-scored 1–10 dimension matrix).
--
-- This was the original "score dressed as a measurement" the project exists to
-- correct: eight hand-entered 0–10 dimensions (publicRealm, settingDrama, …)
-- seeded from a JS-side map (matrixSeedScores) and shown as a city's headline
-- number on the Visit and Decided pages. It violated both the no-fake-data
-- rule and the no-in-source-seed-maps rule.
--
-- Every score the app now shows comes from weightedAxisScore() over the cited
-- measured_metrics. The matrix system (matrixDimensions, matrixSeedScores,
-- benchmarkPlaces, weightedScore, closestBenchmark, normalizeMatrix,
-- averageScore, matrixFor, scoresToMatrix) was removed from lib/planner-data.js
-- and its consumers (VisitWorkspace, DecidedArchive, PlannerProvider,
-- city-row.js, db.js) in the same change. Run once in the Supabase SQL editor.

alter table cities drop column if exists matrix;
