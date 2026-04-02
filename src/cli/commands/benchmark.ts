import { runPilot, runFull } from "../../../benchmark/swe-bench/run";

export async function runBenchmarkCommand(
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (flags.pilot) {
    await runPilot();
  } else if (flags.full) {
    await runFull();
  } else {
    console.log("Usage: optinum benchmark [--pilot | --full]");
    console.log("  --pilot  Run 15-instance SWE-bench pilot");
    console.log(
      "  --full   Run full 206-instance benchmark (requires Python AST)",
    );
  }
}
