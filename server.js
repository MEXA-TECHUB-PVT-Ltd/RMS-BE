require("dotenv").config();
const app = require("./src/app");
const initializeDatabase = require("./src/initialize-db");

const PORT = process.env.P_PORT || 5000;

// Server listening
let server;
initializeDatabase().then(() => {
  server = app.listen(PORT, () => {
    console.log(`Server Running at ${PORT}...`);
  });
});

// Server Error handling
const exitHandler = () => {
  if (server) {
    console.log("Server Closed.");
    process.exit(1);
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  console.log(error.stack);
  exitHandler();
};

process.on("uncaughtException", unexpectedErrorHandler);
process.on("unhandledRejection", unexpectedErrorHandler);
