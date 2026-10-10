import rateLimit from 'express-rate-limit';

// ─── Login Rate Limiter ───────────────────────────────────────────────────────
// Applied only to POST /api/auth/login
// Max 5 failed attempts per IP per 15 minutes

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // max 5 requests per window per IP
  standardHeaders: true,      // return RateLimit-* headers in response
  legacyHeaders: false,       // disable X-RateLimit-* headers

  // Custom response when limit is exceeded
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again after 15 minutes.',
    });
  },

  // Only count failed requests (status >= 400) toward the limit
  skipSuccessfulRequests: true,
});