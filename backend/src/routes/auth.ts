import { Router } from 'express';
import {
  login,
  logout,
  refreshAccessToken,
  getMe,
  updateProfile,
  changePassword,
  getSettings,
  updateSettings,
  getIntegrations,
} from '../controllers/authController';
import { loginRateLimiter } from '../middleware/rateLimiter';
import { protect } from '../middleware/auth';
import {
  validateUpdateProfile,
  validateChangePassword,
  validateUpdateSettings,
} from '../middleware/validateProfile'; // ← Day 26, Session 1

const router = Router();

// ─── Public Routes ────────────────────────────────────────────────────────────

// POST /api/auth/login — rate limited, no auth required
router.post('/login', loginRateLimiter, login);

// POST /api/auth/refresh — issues new access token using httpOnly cookie
router.post('/refresh', refreshAccessToken);

// POST /api/auth/logout — no auth middleware (cookie handles identity)
router.post('/logout', logout);

// ─── Protected Routes ─────────────────────────────────────────────────────────

// GET /api/auth/me — requires valid Bearer token
router.get('/me', protect, getMe);

// ─── Day 26, Session 1: Profile & Settings ────────────────────────────────────

// PATCH /api/auth/me — update name and/or avatar
router.patch('/me', protect, validateUpdateProfile, updateProfile);

// PATCH /api/auth/change-password — requires current password
router.patch('/change-password', protect, validateChangePassword, changePassword);

// GET/PATCH /api/auth/settings — timezone + notification preferences
router.get('/settings', protect, getSettings);
router.patch('/settings', protect, validateUpdateSettings, updateSettings);

// GET /api/auth/integrations — masked, env-sourced (Day 26, Session 3)
router.get('/integrations', protect, getIntegrations);

export default router;