import type { Address } from "./user";
export type { User, Address, UserRole } from "./user";

export interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  addresses: Address[];
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: Date;
  averageOrderValue: number;
  status: "active" | "inactive" | "blocked";
  registeredAt: Date;
  notes?: string;
  tags?: string[];
}

export interface CustomerFormData {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  addresses: Omit<Address, "id" | "isDefault">[];
  status: "active" | "inactive" | "blocked";
  notes?: string;
  tags?: string[];
}

export interface CustomerSegment {
  id: string;
  name: string;
  description: string;
  condition: {
    field: "totalSpent" | "totalOrders" | "averageOrderValue" | "status" | "tags" | "lastOrderDays";
    operator: ">" | "<" | "=" | ">=" | "<=" | "contains" | "not_contains";
    value: string | number;
  }[];
  customerCount: number;
  createdAt: Date;
}
