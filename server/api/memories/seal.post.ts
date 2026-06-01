export default eventHandler(async (event) => {
  const log = useLogger(event);
  const processedCount = await runCompactionEngine();
  log.set({ processed: { count: processedCount } });
  return { success: true, components_sealed: processedCount };
});
