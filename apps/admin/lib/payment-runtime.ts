import crypto from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import Craftgate from "@craftgate/craftgate";
import Stripe from "stripe";
import { getPaymentGatewayRuntimeStatus, resolveIyzicoBaseUrl } from "@/lib/payment-providers";
import { createPaymentAttempt, getPaymentAttemptByToken, updatePaymentAttempt } from "@/lib/db/payment-attempts";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import type { PaymentGatewayConfig } from "@/types/payment";
import type { PaymentAttempt, PaymentInitResult } from "@/types/payment-runtime";

interface CheckoutAddressInput {
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
}

interface CheckoutItemInput {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    total?: number;
}

interface CheckoutContext {
    gateway: PaymentGatewayConfig;
    order: {
        id: string;
        order_number: string;
        total: number;
        currency?: string | null;
    };
    items: CheckoutItemInput[];
    customerEmail: string;
    customerIp: string;
    shippingAddress: CheckoutAddressInput;
    billingAddress: CheckoutAddressInput;
    siteUrl: string;
}

function toCurrencyAmount(value: number) {
    return value.toFixed(2);
}

function toPaytrAmount(value: number) {
    return Math.round(value * 100).toString();
}

function isSuccessfulPaynetResponse(result: Record<string, unknown>) {
    const code = typeof result.code === "number" ? result.code : Number(result.code);
    return Number.isFinite(code) && code === 0;
}

function createAttemptVerificationToken(attempt: Pick<PaymentAttempt, "id" | "idempotency_key">) {
    return crypto
        .createHash("sha256")
        .update(`${attempt.id}:${attempt.idempotency_key}`)
        .digest("hex");
}

function isValidAttemptVerificationToken(attempt: Pick<PaymentAttempt, "id" | "idempotency_key">, receivedToken: string) {
    if (!receivedToken) {
        return false;
    }

    const expected = createAttemptVerificationToken(attempt);
    const expectedBuffer = Buffer.from(expected, "utf8");
    const receivedBuffer = Buffer.from(receivedToken, "utf8");

    if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function toNumber(value: unknown) {
    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "string") {
        const normalized = Number(value.replace(",", "."));
        return Number.isFinite(normalized) ? normalized : Number.NaN;
    }

    return Number.NaN;
}

function isAmountEqual(expected: number, actual: unknown) {
    const actualNumber = toNumber(actual);
    if (!Number.isFinite(actualNumber)) {
        return false;
    }

    return Math.abs(expected - actualNumber) < 0.01;
}

function sanitizeReference(value: string) {
    return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
}

function buildBuyerName(address: CheckoutAddressInput) {
    return `${address.firstName ?? ""} ${address.lastName ?? ""}`.trim() || "Misafir Müşteri";
}

function formatIyzicoDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function createPaytrToken(payload: {
    merchantId: string;
    userIp: string;
    merchantOid: string;
    email: string;
    paymentAmount: string;
    userBasket: string;
    noInstallment: string;
    maxInstallment: string;
    currency: string;
    testMode: string;
    merchantKey: string;
    merchantSalt: string;
}) {
    const hashStr = [
        payload.merchantId,
        payload.userIp,
        payload.merchantOid,
        payload.email,
        payload.paymentAmount,
        payload.userBasket,
        payload.noInstallment,
        payload.maxInstallment,
        payload.currency,
        payload.testMode,
    ].join("");

    return crypto
        .createHmac("sha256", payload.merchantKey)
        .update(`${hashStr}${payload.merchantSalt}`)
        .digest("base64");
}

function createPaytrCallbackHash(input: {
    merchantOid: string;
    status: string;
    totalAmount: string;
    merchantKey: string;
    merchantSalt: string;
}) {
    return crypto
        .createHmac("sha256", input.merchantKey)
        .update(`${input.merchantOid}${input.merchantSalt}${input.status}${input.totalAmount}`)
        .digest("base64");
}

function buildPaytrBasket(items: CheckoutItemInput[]) {
    const basket = items.map((item) => [
        item.productName,
        toCurrencyAmount(item.price),
        item.quantity,
    ]);

    return Buffer.from(JSON.stringify(basket)).toString("base64");
}

function createIyzipayClient(gateway: PaymentGatewayConfig) {
    const apiKey = gateway.credentials.apiKey?.trim();
    const secretKey = gateway.credentials.secretKey?.trim();
    const uri = resolveIyzicoBaseUrl(gateway.configuration.baseUrl, gateway.environment);

    if (!apiKey || !secretKey) {
        throw new Error("iyzico API bilgileri eksik.");
    }

    return { apiKey, secretKey, uri };
}

function createStripeClient(gateway: PaymentGatewayConfig) {
    const secretKey = gateway.credentials.secretKey;

    if (!secretKey) {
        throw new Error("Stripe secret key eksik.");
    }

    return new Stripe(secretKey, {
        apiVersion: "2026-02-25.clover",
    });
}

function createCraftgateClient(gateway: PaymentGatewayConfig) {
    const apiKey = gateway.credentials.apiKey;
    const secretKey = gateway.credentials.secretKey;
    const baseUrl = gateway.configuration.baseUrl || "https://api.craftgate.io";

    if (!apiKey || !secretKey) {
        throw new Error("Craftgate API bilgileri eksik.");
    }

    return new Craftgate.Client({
        apiKey,
        secretKey,
        baseUrl,
        language: "tr",
    });
}

function resolveIyzicoRunnerScript() {
    const candidates = [
        path.resolve(process.cwd(), "scripts", "iyzico-runner.cjs"),
        path.resolve(process.cwd(), "..", "scripts", "iyzico-runner.cjs"),
        path.resolve(process.cwd(), "..", "..", "scripts", "iyzico-runner.cjs"),
        path.resolve(process.cwd(), "..", "..", "..", "scripts", "iyzico-runner.cjs"),
    ];

    const match = candidates.find((candidate) => existsSync(candidate));
    if (!match) {
        throw new Error("iyzico runner script bulunamadi.");
    }

    return match;
}

async function iyzicoRequest<T>(input: {
    gateway: PaymentGatewayConfig;
    operation: "checkoutInit" | "checkoutRetrieve";
    body?: Record<string, unknown>;
}) {
    const client = createIyzipayClient(input.gateway);
    const runnerPath = resolveIyzicoRunnerScript();

    return await new Promise<T>((resolve, reject) => {
        const child = spawn(process.execPath, [runnerPath], {
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("iyzico istegi zaman asimina ugradi."));
        }, 25000);

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        child.on("error", (error) => {
            clearTimeout(timeout);
            reject(error);
        });

        child.on("close", (code) => {
            clearTimeout(timeout);

            if (code !== 0) {
                try {
                    const parsed = stderr ? JSON.parse(stderr) : null;
                    reject(new Error(parsed?.error || "iyzico islemi basarisiz."));
                } catch {
                    reject(new Error(stderr || "iyzico islemi basarisiz."));
                }
                return;
            }

            try {
                const parsed = JSON.parse(stdout);
                resolve(parsed.result as T);
            } catch {
                reject(new Error("iyzico gecersiz yanit dondurdu."));
            }
        });

        child.stdin.end(JSON.stringify({
            operation: input.operation,
            config: client,
            payload: input.body || {},
        }));
    });
}

export async function initializePayment(context: CheckoutContext): Promise<PaymentInitResult> {
    const runtimeStatus = getPaymentGatewayRuntimeStatus(context.gateway);

    if (!runtimeStatus.isReady) {
        throw new Error("Seçilen ödeme yöntemi canlı checkout akışına hazır değil.");
    }

    if (context.gateway.gateway === "bank_transfer" || context.gateway.gateway === "cod") {
        return {
            action: "success",
            paymentAttemptId: "manual",
            message: "Manuel ödeme yöntemi seçildi.",
        };
    }

    if (context.gateway.gateway === "iyzico") {
        return initializeIyzicoPayment(context);
    }

    if (context.gateway.gateway === "paytr") {
        return initializePaytrPayment(context);
    }

    if (context.gateway.gateway === "stripe") {
        return initializeStripePayment(context);
    }

    if (context.gateway.gateway === "paynet") {
        return initializePaynetPayment(context);
    }

    if (context.gateway.gateway === "craftgate") {
        return initializeCraftgatePayment(context);
    }

    throw new Error("Bu ödeme sağlayıcısı için runtime entegrasyonu henüz tamamlanmadı.");
}

async function initializeIyzicoPayment(context: CheckoutContext): Promise<PaymentInitResult> {
    const paymentAttempt = await createPaymentAttempt({
        orderId: context.order.id,
        gatewayId: context.gateway.id,
        provider: context.gateway.gateway,
        amount: context.order.total,
        currency: context.gateway.currency || "TRY",
        idempotencyKey: `${context.order.id}:${context.gateway.id}:${Date.now()}`,
        customerEmail: context.customerEmail,
        customerIp: context.customerIp,
        requestPayload: {
            orderNumber: context.order.order_number,
        },
    });

    const addressLine = context.shippingAddress.address?.trim() || "Adres bilgisi yok";
    const city = context.shippingAddress.city?.trim() || "Istanbul";
    const country = context.shippingAddress.country?.trim() || "Turkey";
    const buyerName = buildBuyerName(context.shippingAddress);
    const now = formatIyzicoDate(new Date());

    const request = {
        locale: "tr",
        conversationId: paymentAttempt.id,
        price: toCurrencyAmount(context.order.total),
        paidPrice: toCurrencyAmount(context.order.total),
        currency: context.gateway.currency || "TRY",
        basketId: context.order.order_number,
        paymentGroup: "PRODUCT",
        paymentSource: "CELEBIX",
        callbackUrl: `${context.siteUrl}/api/payments/iyzico/callback`,
        enabledInstallments: [1, 2, 3, 6, 9, 12],
        buyer: {
            id: paymentAttempt.id,
            name: context.shippingAddress.firstName || "Misafir",
            surname: context.shippingAddress.lastName || "Müşteri",
            gsmNumber: context.shippingAddress.phone || "",
            email: context.customerEmail,
            identityNumber: "11111111111",
            lastLoginDate: now,
            registrationDate: now,
            registrationAddress: addressLine,
            ip: context.customerIp,
            city,
            country,
            zipCode: context.shippingAddress.postalCode || "34000",
        },
        shippingAddress: {
            contactName: buyerName,
            city,
            country,
            address: addressLine,
            zipCode: context.shippingAddress.postalCode || "34000",
        },
        billingAddress: {
            contactName: buyerName,
            city: context.billingAddress.city?.trim() || city,
            country: context.billingAddress.country?.trim() || country,
            address: context.billingAddress.address?.trim() || addressLine,
            zipCode: context.billingAddress.postalCode || context.shippingAddress.postalCode || "34000",
        },
        basketItems: context.items.map((item) => ({
            id: item.productId,
            name: item.productName,
            category1: "Gida",
            itemType: "PHYSICAL",
            price: toCurrencyAmount(item.total ?? item.price * item.quantity),
        })),
    };

    try {
        const response = await iyzicoRequest<Record<string, unknown>>({
            gateway: context.gateway,
            operation: "checkoutInit",
            body: request,
        });

        const token = typeof response.token === "string" ? response.token : null;
        const paymentPageUrl = typeof response.paymentPageUrl === "string" ? response.paymentPageUrl : null;
        const status = typeof response.status === "string" ? response.status : "failure";
        const errorMessage = typeof response.errorMessage === "string" ? response.errorMessage : null;

        await updatePaymentAttempt(paymentAttempt.id, {
            status: status === "success" ? "pending_action" : "failed",
            checkoutToken: token,
            redirectUrl: paymentPageUrl,
            conversationId: paymentAttempt.id,
            responsePayload: response,
            errorMessage,
            completedAt: status === "success" ? null : new Date().toISOString(),
        });

        if (status !== "success" || !paymentPageUrl || !token) {
            throw new Error(errorMessage || "iyzico checkout baslatilamadi.");
        }

        return {
            action: "redirect",
            redirectUrl: paymentPageUrl,
            paymentAttemptId: paymentAttempt.id,
        };
    } catch (error) {
        await updatePaymentAttempt(paymentAttempt.id, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "iyzico ödeme başlatılamadı.",
            completedAt: new Date().toISOString(),
        });
        throw error;
    }
}

async function initializePaytrPayment(context: CheckoutContext): Promise<PaymentInitResult> {
    const merchantId = context.gateway.credentials.merchantId;
    const merchantKey = context.gateway.credentials.merchantKey;
    const merchantSalt = context.gateway.credentials.merchantSalt;

    if (!merchantId || !merchantKey || !merchantSalt) {
        throw new Error("PAYTR merchant bilgileri eksik.");
    }

    const paymentAttempt = await createPaymentAttempt({
        orderId: context.order.id,
        gatewayId: context.gateway.id,
        provider: context.gateway.gateway,
        amount: context.order.total,
        currency: "TL",
        idempotencyKey: `${context.order.id}:${context.gateway.id}:${Date.now()}`,
        customerEmail: context.customerEmail,
        customerIp: context.customerIp,
        requestPayload: {
            orderNumber: context.order.order_number,
        },
    });

    const merchantOid = sanitizeReference(paymentAttempt.id);
    const paymentAmount = toPaytrAmount(context.order.total);
    const userBasket = buildPaytrBasket(context.items);
    const testMode = context.gateway.environment === "production" ? "0" : "1";
    const paytrToken = createPaytrToken({
        merchantId,
        userIp: context.customerIp,
        merchantOid,
        email: context.customerEmail,
        paymentAmount,
        userBasket,
        noInstallment: "0",
        maxInstallment: "12",
        currency: "TL",
        testMode,
        merchantKey,
        merchantSalt,
    });

    const formData = new URLSearchParams({
        merchant_id: merchantId,
        user_ip: context.customerIp,
        merchant_oid: merchantOid,
        email: context.customerEmail,
        payment_amount: paymentAmount,
        paytr_token: paytrToken,
        user_basket: userBasket,
        debug_on: testMode,
        no_installment: "0",
        max_installment: "12",
        user_name: buildBuyerName(context.shippingAddress),
        user_address: context.shippingAddress.address || "Adres bilgisi yok",
        user_phone: context.shippingAddress.phone || "",
        merchant_ok_url: `${context.siteUrl}/api/payments/paytr/return?orderId=${context.order.id}&status=pending`,
        merchant_fail_url: `${context.siteUrl}/api/payments/paytr/return?orderId=${context.order.id}&status=failed`,
        timeout_limit: "30",
        currency: "TL",
        test_mode: testMode,
        lang: "tr",
    });

    try {
        const response = await fetch("https://www.paytr.com/odeme/api/get-token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData,
            signal: AbortSignal.timeout(20000),
        });

        const result = await response.json() as Record<string, unknown>;
        const token = typeof result.token === "string" ? result.token : null;
        const status = typeof result.status === "string" ? result.status : "failed";
        const reason = typeof result.reason === "string" ? result.reason : null;
        const redirectUrl = token ? `https://www.paytr.com/odeme/guvenli/${token}` : null;

        await updatePaymentAttempt(paymentAttempt.id, {
            status: status === "success" ? "pending_action" : "failed",
            checkoutToken: token,
            redirectUrl,
            providerReferenceId: merchantOid,
            responsePayload: result,
            errorMessage: reason,
            completedAt: status === "success" ? null : new Date().toISOString(),
        });

        if (status !== "success" || !token || !redirectUrl) {
            throw new Error(reason || "PAYTR token uretilemedi.");
        }

        return {
            action: "redirect",
            redirectUrl,
            paymentAttemptId: paymentAttempt.id,
        };
    } catch (error) {
        await updatePaymentAttempt(paymentAttempt.id, {
            status: "failed",
            providerReferenceId: merchantOid,
            errorMessage: error instanceof Error ? error.message : "PAYTR ödeme başlatılamadı.",
            completedAt: new Date().toISOString(),
        });
        throw error;
    }
}

async function initializeStripePayment(context: CheckoutContext): Promise<PaymentInitResult> {
    const stripe = createStripeClient(context.gateway);
    const paymentAttempt = await createPaymentAttempt({
        orderId: context.order.id,
        gatewayId: context.gateway.id,
        provider: context.gateway.gateway,
        amount: context.order.total,
        currency: (context.gateway.currency || "TRY").toUpperCase(),
        idempotencyKey: `${context.order.id}:${context.gateway.id}:${Date.now()}`,
        customerEmail: context.customerEmail,
        customerIp: context.customerIp,
        requestPayload: {
            orderNumber: context.order.order_number,
        },
    });

    try {
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            customer_email: context.customerEmail,
            success_url: getOrderRedirectUrl(context.siteUrl, context.order.id, "pending"),
            cancel_url: getOrderRedirectUrl(context.siteUrl, context.order.id, "pending"),
            metadata: {
                attemptId: paymentAttempt.id,
                orderId: context.order.id,
                gatewayId: context.gateway.id,
                orderNumber: context.order.order_number,
            },
            payment_intent_data: {
                metadata: {
                    attemptId: paymentAttempt.id,
                    orderId: context.order.id,
                    gatewayId: context.gateway.id,
                },
            },
            line_items: context.items.map((item) => ({
                quantity: item.quantity,
                price_data: {
                    currency: (context.gateway.currency || "TRY").toLowerCase(),
                    unit_amount: Math.round(item.price * 100),
                    product_data: {
                        name: item.productName,
                        metadata: {
                            productId: item.productId,
                        },
                    },
                },
            })),
        }, {
            idempotencyKey: paymentAttempt.idempotency_key,
        });

        await updatePaymentAttempt(paymentAttempt.id, {
            status: "pending_action",
            checkoutToken: session.id,
            redirectUrl: session.url ?? null,
            providerReferenceId: session.payment_intent?.toString() ?? null,
            responsePayload: session as unknown as Record<string, unknown>,
        });

        if (!session.url) {
            throw new Error("Stripe Checkout URL uretilemedi.");
        }

        return {
            action: "redirect",
            redirectUrl: session.url,
            paymentAttemptId: paymentAttempt.id,
        };
    } catch (error) {
        await updatePaymentAttempt(paymentAttempt.id, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Stripe checkout baslatilamadi.",
            completedAt: new Date().toISOString(),
        });
        throw error;
    }
}

async function initializePaynetPayment(context: CheckoutContext): Promise<PaymentInitResult> {
    const secretKey = context.gateway.credentials.apiKey;

    if (!secretKey) {
        throw new Error("Paynet secret key eksik.");
    }

    const paymentAttempt = await createPaymentAttempt({
        orderId: context.order.id,
        gatewayId: context.gateway.id,
        provider: context.gateway.gateway,
        amount: context.order.total,
        currency: (context.gateway.currency || "TRY").toUpperCase(),
        idempotencyKey: `${context.order.id}:${context.gateway.id}:${Date.now()}`,
        customerEmail: context.customerEmail,
        customerIp: context.customerIp,
        requestPayload: {
            orderNumber: context.order.order_number,
        },
    });

    const callbackToken = createAttemptVerificationToken(paymentAttempt);
    const apiUrl = context.gateway.environment === "production"
        ? "https://api.paynet.com.tr/v1/mailorder/create"
        : "https://pts-api.paynet.com.tr/v1/mailorder/create";
    const callbackUrl = new URL(`${context.siteUrl}/api/payments/paynet/callback`);
    callbackUrl.searchParams.set("attemptId", paymentAttempt.id);
    callbackUrl.searchParams.set("token", callbackToken);

    const successUrl = new URL(`${context.siteUrl}/api/payments/paynet/return`);
    successUrl.searchParams.set("orderId", context.order.id);
    successUrl.searchParams.set("status", "pending");

    const failureUrl = new URL(`${context.siteUrl}/api/payments/paynet/return`);
    failureUrl.searchParams.set("orderId", context.order.id);
    failureUrl.searchParams.set("status", "failed");

    const payload: Record<string, unknown> = {
        amount: Number(toCurrencyAmount(context.order.total)),
        expire_date: 72,
        name_surname: buildBuyerName(context.shippingAddress),
        email: context.customerEmail || undefined,
        phone: context.shippingAddress.phone || undefined,
        send_mail: false,
        send_sms: false,
        note: `${STORE_RUNTIME.name} siparis no: ${context.order.order_number}`,
        agent_note: context.order.order_number,
        reference_no: paymentAttempt.id,
        succeed_url: successUrl.toString(),
        error_url: failureUrl.toString(),
        confirmation_url: callbackUrl.toString(),
        send_confirmation_mail: false,
    };

    if (context.gateway.configuration.agentId?.trim()) {
        payload.agent_id = context.gateway.configuration.agentId.trim();
    }

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20000),
        });

        const result = await response.json() as Record<string, unknown>;
        const redirectUrl = typeof result.url === "string" ? result.url : null;
        const checkoutToken = typeof result.id === "string" ? result.id : null;
        const errorMessage = typeof result.message === "string" ? result.message : "Paynet ödeme linki oluşturulamadı.";

        await updatePaymentAttempt(paymentAttempt.id, {
            status: isSuccessfulPaynetResponse(result) ? "pending_action" : "failed",
            checkoutToken,
            redirectUrl,
            providerReferenceId: paymentAttempt.id,
            responsePayload: result,
            errorMessage: isSuccessfulPaynetResponse(result) ? null : errorMessage,
            completedAt: isSuccessfulPaynetResponse(result) ? null : new Date().toISOString(),
        });

        if (!isSuccessfulPaynetResponse(result) || !redirectUrl) {
            throw new Error(errorMessage);
        }

        return {
            action: "redirect",
            redirectUrl,
            paymentAttemptId: paymentAttempt.id,
        };
    } catch (error) {
        await updatePaymentAttempt(paymentAttempt.id, {
            status: "failed",
            providerReferenceId: paymentAttempt.id,
            errorMessage: error instanceof Error ? error.message : "Paynet ödeme linki oluşturulamadı.",
            completedAt: new Date().toISOString(),
        });
        throw error;
    }
}

async function initializeCraftgatePayment(context: CheckoutContext): Promise<PaymentInitResult> {
    const craftgate = createCraftgateClient(context.gateway);
    const paymentAttempt = await createPaymentAttempt({
        orderId: context.order.id,
        gatewayId: context.gateway.id,
        provider: context.gateway.gateway,
        amount: context.order.total,
        currency: (context.gateway.currency || "TRY").toUpperCase(),
        idempotencyKey: `${context.order.id}:${context.gateway.id}:${Date.now()}`,
        customerEmail: context.customerEmail,
        customerIp: context.customerIp,
        requestPayload: {
            orderNumber: context.order.order_number,
        },
    });

    const currencyKey = (context.gateway.currency || "TRY").toUpperCase() as keyof typeof Craftgate.Model.Currency;
    const currency = Craftgate.Model.Currency[currencyKey] ?? Craftgate.Model.Currency.TRY;

    try {
        const response = await craftgate.payment().initCheckoutPayment({
            price: Number(toCurrencyAmount(context.order.total)),
            paidPrice: Number(toCurrencyAmount(context.order.total)),
            currency,
            paymentGroup: Craftgate.Model.PaymentGroup.Product,
            paymentChannel: "WEB",
            conversationId: paymentAttempt.id,
            externalId: paymentAttempt.id,
            orderId: context.order.order_number,
            callbackUrl: `${context.siteUrl}/api/payments/craftgate/callback`,
            clientIp: context.customerIp,
            enabledPaymentMethods: [Craftgate.Model.PaymentMethod.Card],
            enabledInstallments: [1, 2, 3, 6, 9, 12],
            items: context.items.map((item) => ({
                name: item.productName,
                price: Number(toCurrencyAmount(item.total ?? item.price * item.quantity)),
                externalId: item.productId,
            })),
        });

        await updatePaymentAttempt(paymentAttempt.id, {
            status: response.pageUrl ? "pending_action" : "failed",
            checkoutToken: response.token ?? null,
            redirectUrl: response.pageUrl ?? null,
            responsePayload: response as unknown as Record<string, unknown>,
            completedAt: response.pageUrl ? null : new Date().toISOString(),
        });

        if (!response.pageUrl || !response.token) {
            throw new Error("Craftgate checkout URL uretilemedi.");
        }

        return {
            action: "redirect",
            redirectUrl: response.pageUrl,
            paymentAttemptId: paymentAttempt.id,
        };
    } catch (error) {
        await updatePaymentAttempt(paymentAttempt.id, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Craftgate checkout baslatilamadi.",
            completedAt: new Date().toISOString(),
        });
        throw error;
    }
}

export async function retrieveIyzicoPayment(gateway: PaymentGatewayConfig, token: string) {
    const response = await iyzicoRequest<Record<string, unknown>>({
        gateway,
        operation: "checkoutRetrieve",
        body: {
            locale: "tr",
            token,
        },
    });

    return response;
}

export async function getPaymentAttemptByCheckoutToken(token: string) {
    return getPaymentAttemptByToken(token);
}

export async function retrieveCraftgateCheckoutPayment(gateway: PaymentGatewayConfig, token: string) {
    const craftgate = createCraftgateClient(gateway);
    return craftgate.payment().retrieveCheckoutPayment(token) as Promise<Record<string, unknown>>;
}

export function createStripeWebhookEvent(gateway: PaymentGatewayConfig, payload: string, signature: string) {
    const secretKey = gateway.configuration.webhookSecret;

    if (!secretKey) {
        throw new Error("Stripe webhook secret eksik.");
    }

    const stripe = createStripeClient(gateway);
    return stripe.webhooks.constructEvent(payload, signature, secretKey);
}

export function verifyPaytrCallback(input: {
    merchantOid: string;
    status: string;
    totalAmount: string;
    receivedHash: string;
    gateway: PaymentGatewayConfig;
}) {
    const merchantKey = input.gateway.credentials.merchantKey;
    const merchantSalt = input.gateway.credentials.merchantSalt;

    if (!merchantKey || !merchantSalt) {
        throw new Error("PAYTR callback dogrulamasi icin merchant bilgileri eksik.");
    }

    const expectedHash = createPaytrCallbackHash({
        merchantOid: input.merchantOid,
        status: input.status,
        totalAmount: input.totalAmount,
        merchantKey,
        merchantSalt,
    });

    const expectedBuffer = Buffer.from(expectedHash);
    const receivedBuffer = Buffer.from(input.receivedHash);

    if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function getOrderRedirectUrl(siteUrl: string, orderId: string, status: "success" | "failed" | "pending") {
    return `${siteUrl}/siparisler/${orderId}?payment=${status}`;
}

export function getSafeAttemptStatusFromIyzico(result: Record<string, unknown>): PaymentAttempt["status"] {
    const paymentStatus = typeof result.paymentStatus === "string" ? result.paymentStatus.toUpperCase() : "";
    const status = typeof result.status === "string" ? result.status.toUpperCase() : "";

    if (status === "SUCCESS" && paymentStatus === "SUCCESS") {
        return "captured";
    }

    if (status === "SUCCESS") {
        return "pending_action";
    }

    return "failed";
}

export function getSafeAttemptStatusFromCraftgate(result: Record<string, unknown>): PaymentAttempt["status"] {
    const paymentStatus = typeof result.paymentStatus === "string" ? result.paymentStatus.toUpperCase() : "";

    if (paymentStatus === "SUCCESS") {
        return "captured";
    }

    if (paymentStatus === "WAITING" || paymentStatus === "INIT_THREEDS" || paymentStatus === "CALLBACK_THREEDS") {
        return "pending_action";
    }

    return "failed";
}

export function verifyAttemptToken(attempt: Pick<PaymentAttempt, "id" | "idempotency_key">, receivedToken: string) {
    return isValidAttemptVerificationToken(attempt, receivedToken);
}

export function isExpectedAmount(expected: number, actual: unknown) {
    return isAmountEqual(expected, actual);
}
