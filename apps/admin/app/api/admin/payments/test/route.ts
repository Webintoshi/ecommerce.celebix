import crypto from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import Craftgate from "@craftgate/craftgate";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminAuthContext } from "@/lib/admin-auth";
import { getPaymentGatewayById } from "@/lib/db/payment-gateways";
import { resolveIyzicoBaseUrl } from "@/lib/payment-providers";
import { STORE_RUNTIME } from "@/lib/store-runtime";

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

async function iyzicoApiTest<T>(input: { apiKey: string; secretKey: string; uri: string }) {
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
            operation: "apiTest",
            config: input,
        }));
    });
}

function createPaytrTestToken(input: {
    merchantId: string;
    merchantKey: string;
    merchantSalt: string;
    siteUrl: string;
}) {
    const merchantOid = `test-${Date.now()}`;
    const email = STORE_RUNTIME.senderEmail;
    const paymentAmount = "100";
    const userBasket = Buffer.from(JSON.stringify([["Test Ürün", "1.00", 1]])).toString("base64");
    const userIp = "127.0.0.1";
    const noInstallment = "0";
    const maxInstallment = "1";
    const currency = "TL";
    const testMode = "1";
    const hashStr = `${input.merchantId}${userIp}${merchantOid}${email}${paymentAmount}${userBasket}${noInstallment}${maxInstallment}${currency}${testMode}`;
    const paytrToken = crypto
        .createHmac("sha256", input.merchantKey)
        .update(`${hashStr}${input.merchantSalt}`)
        .digest("base64");

    return new URLSearchParams({
        merchant_id: input.merchantId,
        user_ip: userIp,
        merchant_oid: merchantOid,
        email,
        payment_amount: paymentAmount,
        paytr_token: paytrToken,
        user_basket: userBasket,
        debug_on: "1",
        no_installment: noInstallment,
        max_installment: maxInstallment,
        user_name: "Test Kullanıcı",
        user_address: "Test Adres",
        user_phone: "05555555555",
        merchant_ok_url: `${input.siteUrl}/odeme`,
        merchant_fail_url: `${input.siteUrl}/odeme`,
        timeout_limit: "30",
        currency,
        test_mode: testMode,
        lang: "tr",
    });
}

function getBaseUrl(request: NextRequest) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");

    if (forwardedProto && forwardedHost) {
        return `${forwardedProto}://${forwardedHost}`;
    }

    return new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
    try {
        const auth = await getAdminAuthContext();
        if (!auth) {
            return NextResponse.json({ success: false, error: "Yetkisiz erişim." }, { status: 401 });
        }

        const body = await request.json();
        const gatewayId = typeof body.gatewayId === "string" ? body.gatewayId : "";

        if (!gatewayId) {
            return NextResponse.json({ success: false, error: "Gateway ID gereklidir." }, { status: 422 });
        }

        const gateway = await getPaymentGatewayById(gatewayId);
        if (!gateway) {
            return NextResponse.json({ success: false, error: "Gateway bulunamadi." }, { status: 404 });
        }

        if (gateway.gateway === "bank_transfer") {
            const valid = Boolean(gateway.bankAccount.bankName && gateway.bankAccount.iban && gateway.bankAccount.accountHolder);
            return NextResponse.json({ success: valid, message: valid ? "Banka bilgileri hazır." : "Banka bilgileri eksik." }, { status: valid ? 200 : 422 });
        }

        if (gateway.gateway === "cod") {
            return NextResponse.json({ success: true, message: "Kapıda ödeme kuralları hazır." });
        }

        if (gateway.gateway === "stripe") {
            const stripe = new Stripe(gateway.credentials.secretKey, { apiVersion: "2025-02-24.acacia" });
            await stripe.balance.retrieve();
            return NextResponse.json({ success: true, message: "Stripe API erişimi doğrulandı." });
        }

        if (gateway.gateway === "iyzico") {
            const result = await iyzicoApiTest<Record<string, unknown>>({
                apiKey: gateway.credentials.apiKey,
                secretKey: gateway.credentials.secretKey,
                uri: resolveIyzicoBaseUrl(gateway.configuration.baseUrl, gateway.environment),
            });

            const status = typeof result.status === "string" ? result.status.toLowerCase() : "failure";
            if (status !== "success") {
                return NextResponse.json({ success: false, error: typeof result.errorMessage === "string" ? result.errorMessage : "iyzico doğrulaması başarısız." }, { status: 422 });
            }

            return NextResponse.json({ success: true, message: "iyzico API erişimi doğrulandı." });
        }

        if (gateway.gateway === "paytr") {
            const testRequest = createPaytrTestToken({
                merchantId: gateway.credentials.merchantId,
                merchantKey: gateway.credentials.merchantKey,
                merchantSalt: gateway.credentials.merchantSalt,
                siteUrl: getBaseUrl(request),
            });

            const response = await fetch("https://www.paytr.com/odeme/api/get-token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: testRequest,
                signal: AbortSignal.timeout(20000),
            });
            const result = await response.json() as Record<string, unknown>;
            const status = typeof result.status === "string" ? result.status.toLowerCase() : "failed";
            if (status !== "success") {
                return NextResponse.json({ success: false, error: typeof result.reason === "string" ? result.reason : "PAYTR doğrulaması başarısız." }, { status: 422 });
            }

            return NextResponse.json({ success: true, message: "PAYTR token üretimi doğrulandı." });
        }

        if (gateway.gateway === "paynet") {
            const apiUrl = gateway.environment === "production"
                ? "https://api.paynet.com.tr/v1/mailorder/create"
                : "https://pts-api.paynet.com.tr/v1/mailorder/create";
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    Authorization: `Basic ${Buffer.from(`${gateway.credentials.apiKey}:`).toString("base64")}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    amount: 1,
                    expire_date: 1,
                    name_surname: `${STORE_RUNTIME.name} Test`,
                    send_mail: false,
                    send_sms: false,
                    note: "Bağlantı testi",
                    reference_no: `test-${Date.now()}`,
                    succeed_url: `${getBaseUrl(request)}/odeme`,
                    error_url: `${getBaseUrl(request)}/odeme`,
                }),
                signal: AbortSignal.timeout(20000),
            });
            const result = await response.json() as Record<string, unknown>;
            const code = typeof result.code === "number" ? result.code : Number(result.code);

            if (code !== 0 || typeof result.url !== "string") {
                return NextResponse.json({ success: false, error: typeof result.message === "string" ? result.message : "Paynet doğrulaması başarısız." }, { status: 422 });
            }

            return NextResponse.json({ success: true, message: "Paynet ödeme linki oluşturma erişimi doğrulandı." });
        }

        if (gateway.gateway === "craftgate") {
            const craftgate = new Craftgate.Client({
                apiKey: gateway.credentials.apiKey,
                secretKey: gateway.credentials.secretKey,
                baseUrl: gateway.configuration.baseUrl || "https://api.craftgate.io",
                language: "tr",
            });
            const result = await craftgate.payment().initCheckoutPayment({
                price: 1,
                paidPrice: 1,
                currency: Craftgate.Model.Currency.TRY,
                paymentGroup: Craftgate.Model.PaymentGroup.Product,
                paymentChannel: "WEB",
                conversationId: `test-${Date.now()}`,
                externalId: `test-${Date.now()}`,
                orderId: `TEST-${Date.now()}`,
                callbackUrl: `${getBaseUrl(request)}/odeme`,
                clientIp: "127.0.0.1",
                enabledPaymentMethods: [Craftgate.Model.PaymentMethod.Card],
                items: [{ name: `${STORE_RUNTIME.name} Test`, price: 1, externalId: "test-product" }],
            });

            if (!result.pageUrl || !result.token) {
                return NextResponse.json({ success: false, error: "Craftgate checkout oturumu oluşturulamadı." }, { status: 422 });
            }

            return NextResponse.json({ success: true, message: "Craftgate checkout oluşturma erişimi doğrulandı." });
        }

        return NextResponse.json({ success: false, error: "Bu sağlayıcı için gerçek bağlantı testi henüz tanımlı değil." }, { status: 422 });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Bağlantı testi başarısız." },
            { status: 500 },
        );
    }
}
