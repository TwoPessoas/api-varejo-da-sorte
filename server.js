require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

// Import Routes
const authRoutes = require("./routes/authRoutes");
const clientRoutes = require("./routes/clientRoutes"); 
const userRoutes = require("./routes/userRoutes"); 
const invoiceRoutes = require('./routes/invoiceRoutes');
const protectedRoutes = require("./routes/protectedRoutes");
const gameOpportunityRoutes = require('./routes/gameOpportunityRoutes');
const drawNumberRoutes = require('./routes/drawNumberRoutes');
const pageContentRoutes = require('./routes/pageContentRoutes');
const productRoutes = require('./routes/productRoutes');
const voucherRoutes = require('./routes/voucherRoutes');

// Import Middleware
const errorHandler = require("./middleware/errorHandler");
const { authenticateToken } = require("./middleware/authMiddleware");

const app = express();

// --- Security Middleware ---

// Set various HTTP headers for security
app.use(helmet());

// CORS Configuration
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",")
    : [];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        // and requests from whitelisted origins
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true, // Important for cookies, authorization headers
};
app.use(cors(corsOptions));

// --- Standard Middleware ---

// Body Parsers for JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie Parser to handle cookies (useful for refresh tokens, etc.)
// Note: cookie-parser is not imported, as it's not a direct dependency in this example.
// If you need it for CSRF or other cookie-based mechanisms, run `npm install cookie-parser`.
// Then, uncomment the line below.
 app.use(cookieParser());

// --- API Routes ---

// Public routes (authentication, registration)
app.use("/api/auth", authRoutes);

app.use("/api/clients", clientRoutes);
app.use("/api/users", userRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/opportunities', gameOpportunityRoutes);
app.use('/api/draw-numbers', drawNumberRoutes);
app.use('/api/pages-content', pageContentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/vouchers', voucherRoutes);

// Protected routes (require JWT authentication)
app.use("/api/protected", authenticateToken, protectedRoutes);

// --- Health Check Route ---
app.get("/", (req, res) => {
    res.status(200).json({
        status: "UP",
        message: "API is running successfully.",
    });
});

// --- Error Handling Middleware ---
// This should be the last middleware to be used
app.use(errorHandler);

// --- Server Initialization ---
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server is running on port ${PORT}.`);
    // eslint-disable-next-line no-console
    console.log(`Allowed CORS origins: ${allowedOrigins.join(", ")}`);
});

//module.exports = app; // For testing purposes