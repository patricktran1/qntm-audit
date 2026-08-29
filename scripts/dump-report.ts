import { runAudit } from "../lib/engine/audit";
import { textSummary } from "../lib/summary";
import { decodeAnswers } from "../lib/share";

const encoded = process.argv[2];
const answers = decodeAnswers(encoded);
if (!answers) throw new Error("bad encoded answers");
console.log(textSummary(runAudit(answers)));
