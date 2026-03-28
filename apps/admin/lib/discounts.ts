import { Discount, DiscountFormData } from "@/types/discount";

const discounts: Discount[] = [];

export function getDiscounts(): Discount[] {
  return discounts;
}

export function getDiscountById(id: string): Discount | undefined {
  return discounts.find(d => d.id === id);
}

export function getDiscountByCode(code: string): Discount | undefined {
  return discounts.find(d => d.code.toLowerCase() === code.toLowerCase());
}

export function getActiveDiscounts(): Discount[] {
  const now = new Date();
  return discounts.filter(d =>
    d.status === "active" &&
    d.startDate <= now &&
    d.endDate >= now
  );
}

export function getDiscountsByStatus(status: string): Discount[] {
  return discounts.filter(d => d.status === status);
}

export function addDiscount(data: DiscountFormData): Discount {
  const newDiscount: Discount = {
    id: `disc-${Date.now()}`,
    ...data,
    usedCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  discounts.push(newDiscount);
  return newDiscount;
}

export function updateDiscount(id: string, data: Partial<DiscountFormData>): void {
  const index = discounts.findIndex(d => d.id === id);
  if (index !== -1) {
    discounts[index] = {
      ...discounts[index],
      ...data,
      updatedAt: new Date(),
    };
  }
}

export function deleteDiscount(id: string): void {
  const index = discounts.findIndex(d => d.id === id);
  if (index !== -1) {
    discounts.splice(index, 1);
  }
}

export function duplicateDiscount(id: string): Discount {
  const original = getDiscountById(id);
  if (!original) throw new Error("Discount not found");

  const duplicate: DiscountFormData = {
    ...original,
    name: `${original.name} (Kopya)`,
    code: `${original.code}-COPY`,
    status: "draft",
  };

  return addDiscount(duplicate);
}

export function incrementDiscountUsage(id: string): void {
  const discount = getDiscountById(id);
  if (discount) {
    discount.usedCount++;
    discount.updatedAt = new Date();
  }
}

export function validateDiscount(discount: Partial<DiscountFormData>): string[] {
  const errors: string[] = [];

  if (!discount.name?.trim()) {
    errors.push("İsim gereklidir");
  }

  if (!discount.code?.trim()) {
    errors.push("İndirim kodu gereklidir");
  } else {
    const existing = getDiscountByCode(discount.code);
    if (existing && discount.id && existing.id !== discount.id) {
      errors.push("Bu kod zaten kullanılıyor");
    }
  }

  if (!discount.value || discount.value <= 0) {
    errors.push("İndirim değeri 0'dan büyük olmalıdır");
  }

  if (discount.type === "percentage" && discount.value && discount.value > 100) {
    errors.push("Yüzde indirim 100% den fazla olamaz");
  }

  if (discount.startDate && discount.endDate && discount.startDate >= discount.endDate) {
    errors.push("Bitiş tarihi başlangıç tarihinden sonra olmalıdır");
  }

  if (discount.minValue && discount.minValue < 0) {
    errors.push("Minimum sipariş tutarı geçersiz");
  }

  if (discount.maxValue && discount.maxValue < 0) {
    errors.push("Maksimum indirim tutarı geçersiz");
  }

  if (discount.minValue && discount.maxValue && discount.minValue >= discount.maxValue) {
    errors.push("Minimum değer maksimum değerden küçük olmalıdır");
  }

  if (discount.visibility === "password" && !discount.password?.trim()) {
    errors.push("Parola korumalı indirimlerde parola gereklidir");
  }

  if ((discount.limitType === "once" || discount.limitType === "once_per_customer") && !discount.usageLimit) {
    errors.push("Kullanım sınırlı olduğunda kullanım limiti gereklidir");
  }

  return errors;
}

export function getDiscountUsageStats(discountId: string) {
  const discount = getDiscountById(discountId);
  if (!discount) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return {
    totalUsed: discount.usedCount,
    usedThisMonth: 0, // Would need order history
    usedToday: 0, // Would need order history
    remainingUsage: discount.usageLimit ? discount.usageLimit - discount.usedCount : Infinity,
    percentageUsed: discount.usageLimit ? (discount.usedCount / discount.usageLimit) * 100 : 0,
  };
}

export function bulkDeleteDiscounts(ids: string[]): void {
  ids.forEach(id => deleteDiscount(id));
}

export function generateCouponCode(prefix = "EZM", length = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = prefix;
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
