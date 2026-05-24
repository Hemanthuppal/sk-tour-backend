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
//   const envSuffix = env === 'live' ? '_LIVE' : '_TEST';
//  const envSuffix = '_TEST';
  const envSuffix = '_LIVE';
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

// In routes/phonepe.js - UPDATE THIS SECTION

router.post("/phonepe/orders", async (req, res) => {
    try {
        const { action, amount, currency, environment, merchantOrderId, customerDetails, redirectUrl } = req.body;
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

            // ✅ IMPORTANT: ONLY use redirectUrl from frontend
            // ❌ Do NOT use FRONTEND_PAYMENT_RESULT_URL from .env file
            if (!redirectUrl) {
                return res.status(400).json({
                    success: false,
                    message: "redirectUrl is required from frontend"
                });
            }

            const finalRedirectUrl = `${redirectUrl}?orderId=${orderId}&gateway=phonepe&environment=${env}`;
            console.log(`✅ Using frontend redirect URL: ${finalRedirectUrl}`);

            const request = StandardCheckoutPayRequest.builder()
                .merchantOrderId(orderId)
                .amount(amountInPaise)
                .redirectUrl(finalRedirectUrl)
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

router.post("/flight/phonepe/orders", async (req, res) => {
    try {
        const { action, amount, currency, environment, merchantOrderId, customerDetails, redirectUrl } = req.body;
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

            if (!redirectUrl) {
                return res.status(400).json({
                    success: false,
                    message: "redirectUrl is required from frontend"
                });
            }

            const finalRedirectUrl = `${redirectUrl}?orderId=${orderId}&gateway=phonepe&environment=${env}`;
            console.log(`✅ Using frontend redirect URL: ${finalRedirectUrl}`);

            const request = StandardCheckoutPayRequest.builder()
                .merchantOrderId(orderId)
                .amount(amountInPaise)
                .redirectUrl(finalRedirectUrl)
                .build();

            const response = await client.pay(request);

            // CREATE the transaction record here (not in frontend)
            if (customerDetails) {
                // Convert phone to number for user_id if needed
                const userId = customerDetails.phone ? parseInt(customerDetails.phone.replace(/\D/g, '')) || null : null;
                
                // Check if a transaction with this order_id already exists
                const [existing] = await db.execute(
                    `SELECT id FROM online_flightbooking_transactions WHERE order_id = ?`,
                    [orderId]
                );
                
                if (existing.length > 0) {
                    // Update existing transaction
                    await db.execute(
                        `UPDATE online_flightbooking_transactions 
                         SET 
                             payment_amount = ?,
                             payment_method = ?,
                             payment_status = ?,
                             email = ?,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE order_id = ?`,
                        [
                            amount,
                            "PhonePe",
                            "Processing",
                            customerDetails.email || null,
                            orderId
                        ]
                    );
                    console.log(`✅ Updated existing transaction for order: ${orderId}`);
                } else {
                    // Insert new transaction
                    await db.execute(
                        `INSERT INTO online_flightbooking_transactions 
                         (user_id, order_id, payment_id, payment_amount, payment_method, payment_status, email)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            userId,
                            orderId,                          // order_id
                            orderId,                          // payment_id (same as order_id initially)
                            amount,                           // payment_amount
                            "PhonePe",                        // payment_method
                            "Processing",                     // payment_status
                            customerDetails.email || null     // email
                        ]
                    );
                    console.log(`✅ Created new transaction record for order: ${orderId}`);
                }
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
                // UPDATE the transaction status
                await db.execute(
                    `UPDATE online_flightbooking_transactions 
                     SET payment_status = ?, updated_at = CURRENT_TIMESTAMP 
                     WHERE order_id = ?`,
                    ["Success", merchantOrderId]
                );
            } else if (phonepeStatus === "FAILED") {
                finalStatus = "FAILED";
                await db.execute(
                    `UPDATE online_flightbooking_transactions 
                     SET payment_status = ?, updated_at = CURRENT_TIMESTAMP 
                     WHERE order_id = ?`,
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