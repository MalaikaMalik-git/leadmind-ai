import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, DecodedToken } from '../utils/jwt';

// ─── Extend Express Request ───────────────────────────────────────────────────
// Attach decoded admin payload to req so controllers can access it

declare global {
  namespace Express {
    interface Request {
      admin?: DecodedToken;
    }
  }
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

export const protect = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // 1. Check Authorization header exists and is Bearer format
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
      return;
    }

    // 2. Extract the token (strip "Bearer " prefix)
    const token = authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Malformed token.',
      });
      return;
    }

    // 3. Verify token signature and expiry
    const decoded = verifyAccessToken(token);

    // 4. Attach decoded payload to req for use in controllers
    req.admin = decoded;

    next();
  } catch (error: any) {
    // Handle specific JWT errors with clear messages
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
      return;
    }

    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        message: 'Invalid token. Please log in again.',
      });
      return;
    }

    // Catch-all for unexpected errors
    res.status(500).json({
      success: false,
      message: 'Server error during authentication.',
    });
  }
};