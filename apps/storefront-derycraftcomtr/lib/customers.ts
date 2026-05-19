import { Customer, CustomerFormData } from "@/types/customer";
import { Order } from "@/types/order";
import { getOrders } from "./orders";

const customers: Customer[] = [];

export function getCustomers(): Customer[] {
  return customers;
}

export function getCustomerById(id: string): Customer | undefined {
  return customers.find((c) => c.id === id);
}

export function getCustomerByEmail(email: string): Customer | undefined {
  return customers.find((c) => c.email === email);
}

export function addCustomer(data: CustomerFormData): Customer {
  const newCustomer: Customer = {
    id: `cus-${Date.now()}`,
    ...data,
    addresses: data.addresses.map((addr, i) => ({
      ...addr,
      id: `addr-${Date.now()}-${i}`,
      isDefault: i === 0,
    })),
    totalOrders: 0,
    totalSpent: 0,
    averageOrderValue: 0,
    registeredAt: new Date(),
  };
  customers.push(newCustomer);
  return newCustomer;
}

export function updateCustomer(id: string, data: Partial<Customer>): void {
  const index = customers.findIndex((c) => c.id === id);
  if (index !== -1) {
    customers[index] = { ...customers[index], ...data };
  }
}

export function deleteCustomer(id: string): void {
  const index = customers.findIndex((c) => c.id === id);
  if (index !== -1) {
    customers.splice(index, 1);
  }
}

export function getCustomerOrders(customerId: string): Order[] {
  return getOrders().filter((order) => order.userId === customerId);
}

export function updateCustomerStats(customerId: string): void {
  const customer = getCustomerById(customerId);
  if (!customer) return;

  const orders = getCustomerOrders(customerId);
  const completedOrders = orders.filter((o) => o.status === "delivered");

  customer.totalOrders = completedOrders.length;
  customer.totalSpent = completedOrders.reduce((sum, order) => sum + order.total, 0);
  customer.averageOrderValue =
    completedOrders.length > 0
      ? customer.totalSpent / completedOrders.length
      : 0;
  customer.lastOrderDate =
    completedOrders.length > 0
      ? new Date(Math.max(...completedOrders.map((o) => new Date(o.createdAt).getTime())))
      : undefined;
}

export function exportCustomersToCSV(customers: Customer[]): string {
  const headers = [
    "ID",
    "Email",
    "Ad",
    "Soyad",
    "Telefon",
    "Toplam Sipariş",
    "Toplam Harcama",
    "Ortalama Sipariş Değeri",
    "Son Sipariş Tarihi",
    "Durum",
    "Kayıt Tarihi",
    "Etiketler",
    "Notlar",
  ];

  const rows = customers.map((customer) => [
    customer.id,
    customer.email,
    customer.firstName,
    customer.lastName,
    customer.phone || "",
    customer.totalOrders.toString(),
    customer.totalSpent.toFixed(2),
    customer.averageOrderValue.toFixed(2),
    customer.lastOrderDate?.toISOString() || "",
    customer.status,
    customer.registeredAt.toISOString(),
    customer.tags?.join(", ") || "",
    customer.notes || "",
  ]);

  return [headers, ...rows].map((row) => row.join(",")).join("\n");
}

export function importCustomersFromCSV(csvContent: string): CustomerFormData[] {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) return [];

  const customers: CustomerFormData[] = [];
  const headers = lines[0].split(",");

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    if (values.length !== headers.length) continue;

    const customer: CustomerFormData = {
      email: values[1] || "",
      firstName: values[2] || "",
      lastName: values[3] || "",
      phone: values[4] || undefined,
      status: (values[9] as any) || "active",
      tags: values[11] ? values[11].split(", ").filter(Boolean) : [],
      notes: values[12] || undefined,
      addresses: [],
    };

    if (customer.email && customer.firstName && customer.lastName) {
      customers.push(customer);
    }
  }

  return customers;
}
