import { z } from "zod";

import { sanitizePhoneInput } from "@/lib/utils/phone";

export const editCustomerSchema = z.object({
  customerName: z.string().trim().min(1, "Name is required").max(200),
  customerMobile: z.string().trim().min(6, "Enter a valid mobile number").max(30).transform(sanitizePhoneInput),
});

export type EditCustomerInput = z.infer<typeof editCustomerSchema>;
