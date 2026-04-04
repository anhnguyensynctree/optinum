export async function runBenchmarkCommand(
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (flags.pilot || flags.full) {
    // Benchmark runner lives in benchmark/swe-bench/run.ts and is a dev-only
    // tool not included in the published package. Run via:
    //   npx tsx benchmark/swe-bench/run.ts --pilot
    //   npx tsx benchmark/swe-bench/run.ts --full
    console.error(
      "The benchmark command requires the full source tree. " +
        "Clone the repo and run: npx tsx benchmark/swe-bench/run.ts --" +
        (flags.pilot ? "pilot" : "full"),
    );
    process.exit(1);
  } else {
    console.log("Usage: optinum benchmark [--pilot | --full]");
    console.log("  --pilot  Run 15-instance SWE-bench pilot");
    console.log(
      "  --full   Run full 206-instance benchmark (requires Python AST)",
    );
  }
}
