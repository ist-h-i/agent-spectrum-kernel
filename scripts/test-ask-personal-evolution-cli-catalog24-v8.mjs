// Existing CLI and all 24 tasks with explicit v8. Providers/runners/numeric
// grading/admission are synthetic. The saved safety projection is reverified.
import { personalCliRoundtrip } from './test-helpers-personal-evolution-cli-roundtrip.mjs';
personalCliRoundtrip('catalog24',{scoringVersion:'v8'});
