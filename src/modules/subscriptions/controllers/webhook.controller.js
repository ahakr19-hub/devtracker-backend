const crypto = require('crypto');
const stripeService = require('../services/stripe.service');
const Developer = require('../../auth/schemas/developer.schema');
const Plan = require('../schemas/plan.schema');

// ─── Deployment Health Check ───────────────────────────────────────────────────
// GET /subscribe/webhooks/health — call this after every deploy to confirm
// Railway is running the latest code before doing a real payment test.
exports.webhookHealth = (req, res) => {
  res.status(200).json({
    status: 'ok',
    deployedAt: new Date().toISOString(),
    stripeWebhookSecretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
    mongoConnected: require('mongoose').connection.readyState === 1,
    version: 'v4-atomic-update',
  });
};

// ─── Stripe Webhook ────────────────────────────────────────────────────────────
exports.handleStripeWebhook = async (req, res) => {
  const signature = req.headers['stripe-signature'];

  console.log('>>> [Stripe] body is Buffer:', Buffer.isBuffer(req.body), '| has signature:', !!signature);

  // ── Step 1: Verify signature ────────────────────────────────────────────────
  let event;
  if (!signature) {
    // No signature = local Postman test only. Never skip in production.
    console.warn('⚠️ [Stripe] No stripe-signature header — treating as raw test payload.');
    event = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
  } else {
    try {
      // stripe.webhooks.constructEvent REQUIRES the raw Buffer, never a parsed object.
      event = stripeService.constructWebhookEvent(req.body, signature);
      console.log('✅ [Stripe] Signature verified. Event type:', event.type);
    } catch (err) {
      console.error('❌ [Stripe] Signature verification FAILED:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  // ── Step 2: Only handle checkout.session.completed ──────────────────────────
  if (!event || event.type !== 'checkout.session.completed') {
    console.log('ℹ️ [Stripe] Ignored event type:', event?.type);
    return res.status(200).json({ received: true, ignored: true });
  }

  // ── Step 3: Extract identifiers from the session ─────────────────────────────
  try {
    const session = event.data.object;
    const metadataDeveloperId = session.metadata?.developerId;
    const clientId            = session.client_reference_id;
    const planId              = session.metadata?.planId;
    const stripeCustomerId    = session.customer;
    const stripeSubscriptionId = session.subscription;

    console.log('>>> [Stripe] Session metadata:', JSON.stringify(session.metadata));
    console.log('>>> [Stripe] client_reference_id:', clientId, '| customer:', stripeCustomerId);

    // ── Step 4: Resolve the developer document ────────────────────────────────
    let developerId = metadataDeveloperId || clientId;

    if (!developerId && stripeCustomerId) {
      // Last resort: look up by stored stripeCustomerId
      const found = await Developer.findOne(
        { 'subscription.stripeCustomerId': stripeCustomerId },
        { _id: 1 }
      ).lean();
      if (found) developerId = found._id.toString();
    }

    if (!developerId) {
      console.error('❌ [Stripe] Cannot resolve developer. metadataDeveloperId:', metadataDeveloperId, 'clientId:', clientId, 'stripeCustomerId:', stripeCustomerId);
      return res.status(200).json({ received: true, error: 'developer_not_found' });
    }

    console.log('>>> [Stripe] Resolved developerId:', developerId);

    // ── Step 5: Resolve plan tier & interval ──────────────────────────────────
    let planTier     = 'pro';
    let planInterval = 'monthly';

    if (planId) {
      const dbPlan = await Plan.findById(planId).lean();
      if (dbPlan) {
        planTier     = dbPlan.tier;
        planInterval = dbPlan.interval;
        console.log('✅ [Stripe] Plan resolved:', planTier, '/', planInterval);
      } else {
        console.warn('⚠️ [Stripe] planId not found in DB, defaulting to pro/monthly');
      }
    }

    // ── Step 6: Atomic DB update — the ONLY correct way ──────────────────────
    // findByIdAndUpdate with $set is atomic. It does NOT reload the full document
    // into memory, so there is ZERO risk of a stale in-memory object overwriting
    // fields that were set elsewhere (the race condition that existed before).
    const updated = await Developer.findByIdAndUpdate(
      developerId,
      {
        $set: {
          'subscription.status':               'active',
          'subscription.isPremium':            true,
          'subscription.plan':                 planTier,
          'subscription.stripeCustomerId':     stripeCustomerId,
          'subscription.stripeSubscriptionId': stripeSubscriptionId,
          'subscription.interval':             planInterval,
        }
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      console.error('❌ [Stripe] findByIdAndUpdate returned null for developerId:', developerId);
      return res.status(200).json({ received: true, error: 'update_failed' });
    }

    console.log('🎉 [Stripe] SUCCESS — isPremium:', updated.subscription.isPremium, '| plan:', updated.subscription.plan, '| email:', updated.email);
    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('❌ [Stripe] Internal webhook error:', error);
    return res.status(500).send('Internal Server Error');
  }
};
exports.handlePaymobWebhook = async (req, res, next) => {
  try {
    const { obj } = req.body;
    const signature = req.query.hmac;

    if (!obj || !signature) {
      return res.status(400).send('Missing payload or signature');
    }

    const hmacFields = [
      'amount_cents',
      'created_at',
      'currency',
      'error_occured',
      'has_parent_transaction',
      'id',
      'integration_id',
      'is_3d_secure',
      'is_auth',
      'is_capture',
      'is_refunded',
      'is_standalone_payment',
      'is_voided',
      'order.id',
      'owner',
      'pending',
      'source_data.pan',
      'source_data.sub_type',
      'source_data.type',
      'success'
    ];

    const getNestedValue = (obj, path) => {
      return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    };

    let concatenatedString = '';
    hmacFields.forEach(field => {
      const val = getNestedValue(obj, field);
      // For boolean strictly convert to "true" or "false"
      if (typeof val === 'boolean') {
        concatenatedString += val ? 'true' : 'false';
      } else if (val !== undefined && val !== null) {
        concatenatedString += val.toString();
      }
    });

    const calculatedHmac = crypto
      .createHmac('sha512', process.env.PAYMOB_HMAC)
      .update(concatenatedString)
      .digest('hex');

    if (calculatedHmac !== signature) {
      return res.status(401).send('Invalid signature');
    }

    const isSuccess = obj.success === true;
    const merchantOrderId = obj.order ? obj.order.merchant_order_id : null;

    if (!merchantOrderId) {
      return res.status(400).send('Missing merchant_order_id inside Paymob order');
    }

    const developerId = merchantOrderId.split('_')[0];

    if (isSuccess) {
      await Developer.findByIdAndUpdate(developerId, {
        $set: {
          "subscription.status": "active",
          "subscription.isPremium": true,
          "subscription.paymobSubscriptionId": obj.order.id.toString(),
        }
      });
    } else {
      await Developer.findByIdAndUpdate(developerId, {
        $set: { "subscription.status": "past_due" }
      });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Paymob Webhook Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
