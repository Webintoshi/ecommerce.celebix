// Kullanıcı Rolleri
export type UserRole = "customer" | "admin";

// Adres
export interface Address {
  id: string;
  title: string; // "Ev", "İş" vb.
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  neighborhood?: string;
  addressLine: string;
  postalCode?: string;
  isDefault: boolean;
}

// Kullanıcı
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: UserRole;
  addresses: Address[];
  createdAt: Date;
  updatedAt: Date;
}

// Auth Context Tipi
export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}
