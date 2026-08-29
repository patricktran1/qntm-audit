import { DEMO_PROFILES } from "../lib/engine/profiles";
import { encodeAnswers } from "../lib/share";

for (const p of DEMO_PROFILES) {
  console.log(`${p.id}\t${encodeAnswers(p.answers)}`);
}
