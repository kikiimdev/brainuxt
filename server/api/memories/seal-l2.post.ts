export default eventHandler(async (event) => {
  const log = useLogger(event);
  const componentsSealed = await runL2CompactionEngine();
  const message =
    componentsSealed > 0
      ? `L1 nodes consolidated into a master L2 documentation chapter.`
      : `Skipped loop processing. Inbound nodes count below baseline metrics.`;
  log.set({ processed: { count: componentsSealed, message } });

  return {
    success: true,
    components_sealed: componentsSealed,
    message:
      componentsSealed > 0
        ? `L1 nodes consolidated into a master L2 documentation chapter.`
        : `Skipped loop processing. Inbound nodes count below baseline metrics.`,
  };
});
