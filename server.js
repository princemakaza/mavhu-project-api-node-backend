const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const userRouter = require("./routers/user_router");
const companyRouter = require("./routers/company_router");
const memberRouter = require("./routers/member_router");
const esgDataRouter = require("./routers/esg_data_router");
const esgDashbardRouter = require("./routers/esg_dashboard_router");
const carbonEmissionRouter = require("./routers/carbon_emission_router");
const biodiversityLandUseRouter = require("./routers/biodiversity_data_router");
const cropYieldRouter = require("./routers/crop_yield_router");
const { errorMiddleware } = require("./utils/error_handler");
const setupSwagger = require("./middlewares/swagger");

dotenv.config();
const connectDB = require("./config/db_config");
connectDB();

const app = express();

// CORS configuration
app.use(cors());

// Body parsing middleware - Use express.json() instead of bodyParser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Swagger setup
setupSwagger(app);

// Routes
app.use("/api/v1/users", userRouter);
app.use("/api/v1/companies", companyRouter);
app.use("/api/v1/members", memberRouter);
app.use("/api/v1/esg-data", esgDataRouter);
app.use("/api/v1/esg-dashboard", esgDashbardRouter);
app.use("/api/v1/carbon-emission", carbonEmissionRouter);
app.use("/api/v1/biodiversity-landuse", biodiversityLandUseRouter);
app.use("/api/v1/crop-yield", cropYieldRouter);
// Error middleware

app.use(errorMiddleware);

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ 
    message: `Route ${req.originalUrl} not found`,
    error: "NOT_FOUND"
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err.stack || err);
  
  // If headers already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(err.status || 500).json({ 
    message: err.message || "Something went wrong!",
    error: err.name || "INTERNAL_SERVER_ERROR",
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚗 Server running on port ${PORT}`);
  console.log(`🌍 Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`📧 Email User: ${process.env.EMAIL_USER}`);
  console.log(`📘 Swagger docs available at http://localhost:${PORT}/api-docs`);
  console.log(
    `🛢️ Using MongoDB URI: ${process.env.MONGODB_URI ? "Loaded" : "Not Loaded"}`
  );
});