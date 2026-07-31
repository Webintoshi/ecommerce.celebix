import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default async function EditLuckyWheelPage({ params }: { params: Promise<{ recordId: string }> }) { const { recordId } = await params; return renderMerchantRecordPage({ kind: "lucky_wheel", permission: "promotions.manage", recordId, returnTo: "/discounts/lucky-wheel" }); }
