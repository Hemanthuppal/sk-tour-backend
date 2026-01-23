const express = require("express");
const { randomUUID } = require("crypto");
const {
  StandardCheckoutClient,
  Env,
  StandardCheckoutPayRequest,
} = require("pg-sdk-node");
const db = require("../config/db");

const router = express.Router();

// Helper function to get PhonePe credentials
const getPhonePeCredentials = (env) => {
  const envSuffix = env === 'live' ? '_LIVE' : '_TEST';
  return {
    clientId: process.env[`PHONEPE_CLIENT_ID${envSuffix}`],
    clientSecret: process.env[`PHONEPE_CLIENT_SECRET${envSuffix}`],
    phonePeEnv: process.env[`PHONEPE_ENV${envSuffix}`] || 'SANDBOX'
  };
};

// Create client based on environment
const createPhonePeClient = (env) => {
  const credentials = getPhonePeCredentials(env);
  return StandardCheckoutClient.getInstance(
    credentials.clientId,
    credentials.clientSecret,
    Number(process.env.PHONEPE_CLIENT_VERSION) || 1,
    credentials.phonePeEnv === "PRODUCTION" ? Env.PRODUCTION : Env.SANDBOX
  );
};

let currentEnv = process.env.PAYMENT_ENV || 'test';
let client = createPhonePeClient(currentEnv);

const FRONTEND_PAYMENT_RESULT_URL = process.env.FRONTEND_PAYMENT_RESULT_URL;

/* ================= COMBINED PHONEPE API ================= */
// In your phonepe API (routes/phonepe.js), update the create-order section:

router.post("/phonepe/orders", async (req, res) => {
    try {
        const { action, amount, currency, environment, merchantOrderId, customerDetails } = req.body;
        const env = environment || currentEnv;
        
        console.log(`PhonePe API called - Action: ${action}, Env: ${env}`);
        
        if (action === 'create-order') {
            // Create Order
            if (!amount) {
                return res.status(400).json({
                    success: false,
                    message: "Amount is required"
                });
            }
            
            // Reinitialize client if environment changed
            if (environment && environment !== currentEnv) {
                currentEnv = environment;
                client = createPhonePeClient(currentEnv);
            }
            
            const amountInPaise = Math.round(Number(amount) * 100);
            const orderId = merchantOrderId || randomUUID();

            const request = StandardCheckoutPayRequest.builder()
                .merchantOrderId(orderId)
                .amount(amountInPaise)
                .redirectUrl(
                    `${FRONTEND_PAYMENT_RESULT_URL}?orderId=${orderId}&gateway=phonepe&environment=${env}`
                )
                .build();

            const response = await client.pay(request);

            // Insert into payments table if checkout_id is provided in customerDetails
            if (customerDetails && customerDetails.checkout_id) {
                await db.execute(
                    `UPDATE payments 
                     SET payment_gateway = ?,
                         gateway_txn_id = ?,
                         status = ?,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE booking_id = ?`,
                    [
                        "PhonePe",
                        orderId,
                        "Pending",
                        customerDetails.checkout_id
                    ]
                );
            }

            return res.json({
                success: true,
                action: 'order-created',
                checkoutPageUrl: response.redirectUrl,
                merchantOrderId: orderId,
                amount: amount,
                currency: currency || "INR",
                environment: env
            });
            
        } else if (action === 'check-status') {
            // Check Status
            if (!merchantOrderId) {
                return res.status(400).json({
                    success: false,
                    message: "merchantOrderId is required"
                });
            }

            console.log(`Checking PhonePe status for: ${merchantOrderId}, env: ${env}`);

            // Use correct client for environment
            const checkClient = createPhonePeClient(env);
            const response = await checkClient.getOrderStatus(merchantOrderId);
            
            console.log("PhonePe API response:", response);
            
            const phonepeStatus = response.state || response.status;
            let finalStatus = "PENDING";

            if (phonepeStatus === "COMPLETED" || phonepeStatus === "SUCCESS") {
                finalStatus = "SUCCESS";
                // Update payments table
                await db.execute(
                    `UPDATE payments SET status=? WHERE gateway_txn_id=?`,
                    ["Success", merchantOrderId]
                );
            } else if (phonepeStatus === "FAILED") {
                finalStatus = "FAILED";
                await db.execute(
                    `UPDATE payments SET status=? WHERE gateway_txn_id=?`,
                    ["Failed", merchantOrderId]
                );
            }

            return res.json({
                success: true,
                action: 'status-checked',
                merchantOrderId,
                status: finalStatus,
                phonepeStatus: phonepeStatus,
                environment: env
            });
            
        } else {
            return res.status(400).json({
                success: false,
                message: "Invalid action. Use: create-order, check-status"
            });
        }
        
    } catch (error) {
        console.error("PhonePe API error:", error);
        res.status(500).json({
            success: false,
            message: "PhonePe operation failed",
            error: error.message
        });
    }
});

/* ================= GET ENVIRONMENT ================= */
router.get("/phonepe/environment", (req, res) => {
  const credentials = getPhonePeCredentials(currentEnv);
  res.json({ 
    environment: currentEnv,
    clientId: credentials.clientId,
    phonePeEnv: credentials.phonePeEnv
  });
});

/* ================= SET ENVIRONMENT ================= */
router.post("/phonepe/set-environment", (req, res) => {
  const { environment } = req.body;
  
  if (environment === 'test' || environment === 'live') {
    currentEnv = environment;
    client = createPhonePeClient(environment);
    
    console.log(`PhonePe environment switched to ${environment}`);
    
    res.json({ 
      success: true, 
      environment: currentEnv,
      message: `PhonePe environment switched to ${environment}`
    });
  } else {
    res.status(400).json({ error: "Invalid environment" });
  }
});

module.exports = router;