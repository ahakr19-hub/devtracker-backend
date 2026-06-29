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

  // ── Step 2: Route to the correct event handler ──────────────────────────────
  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event.data.object);

    } else if (event.type === 'invoice.paid') {
      await handleInvoicePaid(event.data.object);

    } else {
      console.log('ℹ️ [Stripe] Ignored event type:', event.type);
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('❌ [Stripe] Internal webhook error:', error);
    return res.status(500).send('Internal Server Error');
  }
};

// ─── Helper: upgrade developer atomically ────────────────────────────────────
async function upgradeDeveloper({ developerId, stripeCustomerId, stripeSubscriptionId, planId, source }) {
  if (!developerId && stripeCustomerId) {
    const found = await Developer.findOne(
      { 'subscription.stripeCustomerId': stripeCustomerId },
      { _id: 1 }
    ).lean();
    if (found) developerId = found._id.toString();
  }

  if (!developerId) {
    console.error(`❌ [Stripe/${source}] Cannot resolve developer. customerId:`, stripeCustomerId);
    return null;
  }

  let planTier = 'pro';
  let planInterval = 'monthly';

  if (planId) {
    const dbPlan = await Plan.findById(planId).lean();
    if (dbPlan) {
      planTier     = dbPlan.tier;
      planInterval = dbPlan.interval;
      console.log(`✅ [Stripe/${source}] Plan resolved:`, planTier, '/', planInterval);
    } else {
      console.warn(`⚠️ [Stripe/${source}] planId not in DB, defaulting to pro/monthly`);
    }
  }

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
    console.error(`❌ [Stripe/${source}] findByIdAndUpdate returned null for developerId:`, developerId);
    return null;
  }

  console.log(`🎉 [Stripe/${source}] SUCCESS — email: ${updated.email} | isPremium: ${updated.subscription.isPremium} | plan: ${updated.subscription.plan}`);
  return updated;
}

// ─── Handler: checkout.session.completed ─────────────────────────────────────
async function handleCheckoutCompleted(session) {
  const developerId         = session.metadata?.developerId || session.client_reference_id;
  const stripeCustomerId    = session.customer;
  const stripeSubscriptionId = session.subscription;
  const planId              = session.metadata?.planId;

  console.log('>>> [Stripe/checkout.session.completed] metadata:', JSON.stringify(session.metadata));
  console.log('>>> [Stripe/checkout.session.completed] customer:', stripeCustomerId, '| developerId:', developerId);

  await upgradeDeveloper({ developerId, stripeCustomerId, stripeSubscriptionId, planId, source: 'checkout' });
}

// ─── Handler: invoice.paid ────────────────────────────────────────────────────
// Fires on first subscription payment AND every renewal. Use stripeCustomerId
// as the lookup key since there is no session metadata on invoice objects.
async function handleInvoicePaid(invoice) {
  // Only act on paid invoices for a subscription (not one-off charges)
  if (invoice.billing_reason === 'manual') {
    console.log('ℹ️ [Stripe/invoice.paid] Skipping manual invoice:', invoice.id);
    return;
  }

  const stripeCustomerId     = invoice.customer;
  const stripeSubscriptionId = invoice.subscription;

  console.log('>>> [Stripe/invoice.paid] customer:', stripeCustomerId, '| subscription:', stripeSubscriptionId);

  await upgradeDeveloper({ developerId: null, stripeCustomerId, stripeSubscriptionId, planId: null, source: 'invoice' });
}


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

    // Guard: verify the extracted developerId is a valid MongoDB ObjectId.
    // A malformed merchantOrderId would produce garbage here and findByIdAndUpdate
    // would silently do nothing — making a payment effectively lost with no error log.
    if (!require('mongoose').Types.ObjectId.isValid(developerId)) {
      console.error('[Paymob] Invalid developerId in merchantOrderId:', merchantOrderId);
      return res.status(400).send('Invalid merchant_order_id format');
    }

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
