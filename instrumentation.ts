export async function register() {
  // Only run scheduler in production
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production"
  ) {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
