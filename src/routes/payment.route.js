import express from 'express';
import { initPayment, webhookHandler } from '../controllers/payment.controller.js';

const router = express.Router();

router.post('/payments/webhook', express.raw({ type: 'application/json' }), webhookHandler);
router.post('/payments/init',initPayment);

export default router;