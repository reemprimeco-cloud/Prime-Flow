import { describe, expect, it } from "vitest";

import { renderTemplate, type TemplateName, type TemplateVariables } from "@/lib/notifications/templates";

const CUSTOMER_TEMPLATES: TemplateName[] = [
  "order_received",
  "order_in_production",
  "order_ready_for_pickup",
  "order_out_for_delivery",
  "order_collected_confirmation",
  "order_delivered_confirmation",
];

const EMPLOYEE_TEMPLATES: TemplateName[] = [
  "job_assigned",
  "job_reassigned",
  "high_priority_job_assigned",
  "material_request_approved",
  "job_cancelled",
];

const VARS: TemplateVariables = {
  customerName: "Layla Hassan",
  orderNumber: "#1045",
  productName: "Business Cards",
  deliveryDate: "2026-07-18",
  deliveryTime: "14:00",
};

describe("Notification templates", () => {
  it("renders every customer template in both English and Arabic without throwing", () => {
    for (const name of CUSTOMER_TEMPLATES) {
      for (const language of ["en", "ar"] as const) {
        const rendered = renderTemplate(name, language, VARS);
        expect(typeof rendered).toBe("string");
        expect(rendered.length).toBeGreaterThan(0);
      }
    }
  });

  it("renders every employee template in both English and Arabic without throwing", () => {
    for (const name of EMPLOYEE_TEMPLATES) {
      for (const language of ["en", "ar"] as const) {
        const rendered = renderTemplate(name, language, VARS);
        expect(typeof rendered).toBe("string");
        expect(rendered.length).toBeGreaterThan(0);
      }
    }
  });

  it("interpolates the order number and product name into the rendered text", () => {
    const rendered = renderTemplate("job_assigned", "en", VARS);
    expect(rendered).toContain("#1045");
    expect(rendered).toContain("Business Cards");
  });

  it("falls back to the default company name and pickup location when not provided", () => {
    const rendered = renderTemplate("order_ready_for_pickup", "en", VARS);
    expect(rendered).toContain("Prime Printing Co.");
  });

  it("prefers an explicitly-passed companyName/pickupLocation over the default", () => {
    const rendered = renderTemplate("order_received", "en", {
      ...VARS,
      companyName: "Test Print Shop",
    });
    expect(rendered).toContain("Test Print Shop");
    expect(rendered).not.toContain("Prime Printing Co.");
  });

  it("renders visibly different text for English vs Arabic", () => {
    const en = renderTemplate("order_delivered_confirmation", "en", VARS);
    const ar = renderTemplate("order_delivered_confirmation", "ar", VARS);
    expect(en).not.toBe(ar);
  });

  it("flags urgent jobs distinctly from a routine assignment", () => {
    const routine = renderTemplate("job_assigned", "en", VARS);
    const urgent = renderTemplate("high_priority_job_assigned", "en", VARS);
    expect(urgent.toUpperCase()).toContain("URGENT");
    expect(routine.toUpperCase()).not.toContain("URGENT");
  });
});
