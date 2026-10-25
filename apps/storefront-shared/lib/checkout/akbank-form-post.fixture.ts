export function fixtureAkbankForm(environment: "test" | "live" = "test") {
  const fields: Record<string, string> = Object.fromEntries([
    "paymentModel", "txnCode", "merchantSafeId", "terminalSafeId", "orderId", "lang", "amount",
    "ccbRewardAmount", "pcbRewardAmount", "xcbRewardAmount", "currencyCode", "installCount", "okUrl", "failUrl",
    "emailAddress", "mobilePhone", "homePhone", "workPhone", "subMerchantId", "randomNumber", "requestDateTime",
    "b2bIdentityNumber", "merchantData", "merchantBranchNo", "mobileEci", "walletProgramData", "mobileAssignedId", "mobileDeviceType", "hash",
  ].map((key) => [key, ""]));
  Object.assign(fields, { paymentModel: "3D_PAY_HOSTING", txnCode: "3000", merchantSafeId: "1".repeat(32),
    terminalSafeId: "2".repeat(32), orderId: "celebix-fixture-1", lang: "TR", amount: "123.45", ccbRewardAmount: "0.00",
    pcbRewardAmount: "0.00", xcbRewardAmount: "0.00", currencyCode: "949", installCount: "1",
    okUrl: `https://shop.example.test/api/payments/akbank_json/callback/${Buffer.alloc(32, 7).toString("base64url")}`,
    failUrl: `https://shop.example.test/api/payments/akbank_json/callback/${Buffer.alloc(32, 7).toString("base64url")}`,
    randomNumber: "A".repeat(128), requestDateTime: "2026-10-25T12:30:00.000", hash: Buffer.alloc(64, 3).toString("base64") });
  return { kind: "form_post" as const, url: environment === "test"
    ? "https://virtualpospaymentgatewaypre.akbank.com/payhosting" : "https://virtualpospaymentgateway.akbank.com/payhosting", fields };
}
