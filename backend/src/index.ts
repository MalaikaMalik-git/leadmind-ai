import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
dotenv.config();

import authRoutes      from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import campaignRoutes  from './routes/campaigns';   
import leadRoutes      from './routes/leads';       // ← Day 11
import webhookRoutes   from './routes/webhooks';    // ← Day 14 (+ Day 15 retry scheduling/auto-advance, Day 17 topic analysis)
import callRoutes      from './routes/calls';       // ← Day 14 (test outbound call)
import analyticsRoutes from './routes/analytics';   // ← Day 17, Session 2 (topics/call-duration/conversion-rate)
import transcriptRoutes from './routes/transcripts'; // ← Day 19, Session 1 (single transcript detail)
import calendarRoutes from './routes/calendar';       // ← Day 22, Session 1 (Google OAuth2)
import meetingRoutes from './routes/meetings';          // ← Day 23, Session 2 (UC-13 booking)
import auditLogRoutes from './routes/auditLog';           // ← Day 26, Session 1 (audit log viewer)

import { startCampaignPoller } from './services/campaignPollerService'; // ← Day 15, Session 3

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth',      authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/campaigns', campaignRoutes);           // ← Day 7
app.use('/api/leads',     leadRoutes);               // ← Day 11
app.use('/api/webhooks',  webhookRoutes);            // ← Day 14 (VAPI events)
app.use('/api/calls',     callRoutes);               // ← Day 14 (test outbound call)
app.use('/api/analytics', analyticsRoutes);          // ← Day 17, Session 2
app.use('/api/transcripts', transcriptRoutes);       // ← Day 19, Session 1
app.use('/api/calendar',   calendarRoutes);           // ← Day 22, Session 1
app.use('/api/meetings',   meetingRoutes);              // ← Day 23, Session 2
app.use('/api/audit-log',  auditLogRoutes);             // ← Day 26, Session 1

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'leadmind-backend' }));

// ─── MongoDB Connection ───────────────────────────────────────────────────────

mongoose.connect(process.env.MONGODB_URI!)
  .then(() => {
    console.log('✅ MongoDB connected');

    // ── Day 15, Session 3: campaign poller ──────────────────────────────────
    // Closes the gap where a scheduled retry needs to fire but no other
    // in-flight call's webhook is around to trigger auto-advance. Runs
    // every CAMPAIGN_POLL_INTERVAL_MS (default 60s) and asks the
    // orchestrator to dial one eligible lead per Running campaign, if any.
    const pollIntervalMs = Number(process.env.CAMPAIGN_POLL_INTERVAL_MS) || 60 * 1000;
    startCampaignPoller(pollIntervalMs);
  })
  .catch(err => console.error('❌ MongoDB error:', err));

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));

export default app;