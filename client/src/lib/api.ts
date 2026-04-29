import { apiRequest } from "./queryClient";
import { 
  InsertGemachApplication, 
  InsertContact, 
  InsertTransaction,
  InsertLocation
} from "@shared/schema";

// Locations API
export const getLocations = async () => {
  const response = await fetch("/api/locations", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch locations");
  }
  return response.json();
};

export const getLocationsByRegion = async (regionSlug: string) => {
  const response = await fetch(`/api/regions/${regionSlug}/locations`, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to fetch locations for region: ${regionSlug}`);
  }
  return response.json();
};

export const getLocation = async (id: number) => {
  const response = await fetch(`/api/locations/${id}`, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to fetch location with id: ${id}`);
  }
  return response.json();
};

export const createLocation = async (data: InsertLocation) => {
  return apiRequest("POST", "/api/locations", data);
};

export const updateLocation = async (id: number, data: Partial<InsertLocation>) => {
  return apiRequest("PATCH", `/api/locations/${id}`, data);
};

export const deleteLocation = async (id: number) => {
  return apiRequest("DELETE", `/api/locations/${id}`, {});
};

// Regions API
export const getRegions = async () => {
  const response = await fetch("/api/regions", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch regions");
  }
  return response.json();
};

// Gemach Applications API
export const submitGemachApplication = async (data: InsertGemachApplication) => {
  return apiRequest("POST", "/api/applications", data);
};

export const getGemachApplications = async () => {
  const response = await fetch("/api/applications", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch gemach applications");
  }
  return response.json();
};

export const updateGemachApplicationStatus = async (id: number, status: string) => {
  return apiRequest("PATCH", `/api/applications/${id}`, { status });
};

export const approveApplicationWithLocation = async (id: number, locationData: InsertLocation): Promise<{ application: any; location: any; inviteCode: string }> => {
  const response = await apiRequest("POST", `/api/applications/${id}/approve-with-location`, locationData);
  return response.json();
};

export const resendApplicationConfirmationEmail = async (id: number) => {
  return apiRequest("POST", `/api/applications/${id}/resend-confirmation`, {});
};

// Transactions API
export const getTransactions = async () => {
  const response = await fetch("/api/transactions", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch transactions");
  }
  return response.json();
};

export const createTransaction = async (data: InsertTransaction) => {
  return apiRequest("POST", "/api/transactions", data);
};

export const updateTransaction = async (id: number, data: Partial<InsertTransaction>) => {
  return apiRequest("PATCH", `/api/transactions/${id}`, data);
};

export const markTransactionReturned = async (
  id: number, 
  options?: { refundAmount?: number; notes?: string }
) => {
  return apiRequest("PATCH", `/api/transactions/${id}/return`, {
    isReturned: true,
    actualReturnDate: new Date(),
    ...(options?.refundAmount !== undefined && { refundAmount: options.refundAmount }),
    ...(options?.notes && { notes: options.notes }),
  });
};

// Contact API
export const submitContactForm = async (data: InsertContact) => {
  return apiRequest("POST", "/api/contact", data);
};

export const getContacts = async () => {
  const response = await fetch("/api/contact", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch contacts");
  }
  return response.json();
};

export const markContactRead = async (id: number) => {
  return apiRequest("PATCH", `/api/contact/${id}/read`, { isRead: true });
};
