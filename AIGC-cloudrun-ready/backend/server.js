const { startServer } = require("./src/app");

startServer().catch((error) => {
  console.error(error && (error.stack || error.message) || error);
  process.exit(1);
});
