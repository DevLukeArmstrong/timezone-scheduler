import { authorizeCronRequest } from "@/lib/cron-auth";
import { evaluateDirtyGroupQuorums } from "@/lib/services/quorum";

// Manual trigger for the quorum ("N of you are free") evaluation. The
// scheduler runs this every tick for groups that have been dirty for a
// couple of minutes; this route skips the debounce and evaluates every
// dirty group right now. Safe to call repeatedly — reconciliation against
// stored QuorumAlert rows is what stops repeat posts, not the debounce.
//
//   curl -fsS -X POST \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     https://your-host/api/cron/quorum
//
export async function POST(request: Request): Promise<Response> {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const summary = await evaluateDirtyGroupQuorums(new Date(), { ignoreDebounce: true });
  return Response.json(summary);
}
