import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewLuckyWheelPage() { return renderMerchantRecordPage({ kind: "lucky_wheel", permission: "promotions.manage", returnTo: "/discounts/lucky-wheel" }); }
