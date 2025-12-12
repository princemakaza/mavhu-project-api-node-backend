const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const userRouter = require("./routers/user_router");
const companyRouter = require("./routers/company_router");
const memberRouter = require("./routers/member_router");
const { errorMiddleware } = require("./utils/error_handler");
const setupSwagger = require("./middlewares/swagger");
dotenv.config();
const connectDB = require("./config/db_config"); // FIX your path if required
connectDB();
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());
setupSwagger(app);
app.use((err, req, res, next) => {
  console.error("Global error handler:", err.stack || err);
  res.status(500).json({ message: "Something went wrong!" });
});
app.use("/api/v1/users", userRouter);
app.use("/api/v1/companies", companyRouter);
app.use("/api/v1/members", memberRouter);
app.use(errorMiddleware);

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚗 Server running on port ${PORT}`);
  console.log(`🌍 Frontend URL: ${process.env.FRONTEND_URL}`);
    console.log(`🌍 Frontend URL: ${process.env.EMAIL_USER}`);
  console.log(`🌍 Frontend URL: ${process.env.FRONTEND_URL}`);

  console.log(`📘 Swagger docs available at http://localhost:${PORT}/api-docs`);
  console.log(
    `🛢️ Using MongoDB URI: ${process.env.MONGODB_URI ? "Loaded" : "Not Loaded"}`
  );
});
