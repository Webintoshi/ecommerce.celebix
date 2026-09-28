export default Object.freeze({
  allowedDevOrigins: Object.freeze(["127.0.0.1"]),
  devIndicators: false,
  // Use bounded disk space for local visual QA on hosts with low free storage.
  webpack(config) {
    if (process.env.CELEBIX_FIXTURE_MEMORY_CACHE === "1") config.cache = { type: "memory" };
    return config;
  },
  experimental: Object.freeze({ externalDir: true }),
});
