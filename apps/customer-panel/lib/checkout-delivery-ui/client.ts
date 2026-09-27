import type { MerchantAdminRecord } from "@celebix/saas-contracts";
import { merchantAdminApi, MerchantAdminApiError } from "../merchant-admin-ui/client.ts";
import { buildCheckoutDeliveryConfig, readCheckoutDeliverySettings, selectCheckoutDeliveryRecord, selectActiveCheckoutDeliveryRecord, type CheckoutDeliverySettings } from "./model.ts";

export type CheckoutDeliveryWorkspace = Readonly<{ record: MerchantAdminRecord | null; settings: CheckoutDeliverySettings | null; activeRecord?: MerchantAdminRecord | null }>;
export type CheckoutDeliverySave = Readonly<{ record: MerchantAdminRecord | null; settings: CheckoutDeliverySettings; status: "draft" | "active"; operationId: string }>;
export function createCheckoutDeliveryClient(api: Pick<typeof merchantAdminApi, "records" | "save"> = merchantAdminApi) {
  return Object.freeze({
    newOperationId: () => crypto.randomUUID(),
    async current(): Promise<CheckoutDeliveryWorkspace> {
      const records = await api.records("shipping_setting");
      if (records.some((record) => record.kind !== "shipping_setting")) throw new MerchantAdminApiError("unavailable", 503);
      const record = selectCheckoutDeliveryRecord(records);
      const activeRecord = selectActiveCheckoutDeliveryRecord(records);
      if (activeRecord) readCheckoutDeliverySettings(activeRecord.config);
      return Object.freeze({ record, settings: record === null ? null : readCheckoutDeliverySettings(record.config), activeRecord });
    },
    async save(input: CheckoutDeliverySave) {
      const record = input.record;
      if (record && (record.kind !== "shipping_setting" || record.status === "archived")) throw new MerchantAdminApiError("invalid_input", 400);
      const result = await api.save("shipping_setting", {
        ...(record ? { recordId: record.id, expectedVersion: record.version } : {}),
        name: record?.name ?? "Teslimat ücreti",
        config: buildCheckoutDeliveryConfig(record?.config ?? {}, input.settings),
        status: input.status,
      }, input.operationId);
      if (result.kind !== "shipping_setting" || result.status !== input.status || (record && result.id !== record.id)) throw new MerchantAdminApiError("unavailable", 503);
      return result;
    },
  });
}
export type CheckoutDeliveryClient = ReturnType<typeof createCheckoutDeliveryClient>;
export const checkoutDeliveryApi = createCheckoutDeliveryClient();
