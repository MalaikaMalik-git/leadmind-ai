import jwt, { JwtPayload } from 'jsonwebtoken';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenPayload {
  adminId: string;
  email: string;
}

export interface DecodedToken extends TokenPayload, JwtPayload {}

// ─── Env Guards ───────────────────────────────────────────────────────────────

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET as string;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in .env');
}

// ─── Sign Access Token (15 minutes) ──────────────────────────────────────────

export const signAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
};

// ─── Sign Refresh Token (7 days) ─────────────────────────────────────────────

export const signRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
};

// ─── Verify Access Token ──────────────────────────────────────────────────────

export const verifyAccessToken = (token: string): DecodedToken => {
  return jwt.verify(token, ACCESS_SECRET) as DecodedToken;
};

// ─── Verify Refresh Token ─────────────────────────────────────────────────────

export const verifyRefreshToken = (token: string): DecodedToken => {
  return jwt.verify(token, REFRESH_SECRET) as DecodedToken;
};