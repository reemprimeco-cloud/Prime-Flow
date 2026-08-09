import { describe, expect, it } from "vitest";

import { renderTemplate, type TemplateName, type TemplateVariables } from "@/lib/notifications/templates";

const CUSTOMER_TEMPLATES: TemplateName[] = [
  "order_received",
  "order_in_production",
  "order_ready_for_pickup",
  "order_out_for_delivery",
  "order_returned_to_production",
  "order_collected_confirmation",
  "order_delivered_confirmation",
];

const EMPLOYEE_TEMPLATES: TemplateName[] = [
  "job_assigned",
  "job_reassigned",
  "high_priority_job_assigned",
  "material_request_approved",
  "job_cancelled",
  "internal_pickup_ready",
  "order_out_for_delivery_staff",
  "material_purchase_needed",
  "job_ready_for_you",
  "admin_order_note_added",
  "admin_order_status_changed",
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

  it("includes the Google Maps link in the delivery-staff notification when provided", () => {
    const mapsLink = "https://www.google.com/maps/search/?api=1&query=Salmiya%2C%20Block%203";
    const withLink = renderTemplate("order_out_for_delivery_staff", "en", { ...VARS, mapsLink });
    expect(withLink).toContain(mapsLink);

    const withoutLink = renderTemplate("order_out_for_delivery_staff", "en", VARS);
    expect(withoutLink).not.toContain("Location:");
  });

  it("tells the admin who added a note and what it said", () => {
    const rendered = renderTemplate("admin_order_note_added", "en", {
      ...VARS,
      employeeName: "Hassan Youssef",
      noteText: "Ran out of gold foil, switching to backup roll.",
    });
    expect(rendered).toContain("Hassan Youssef");
    expect(rendered).toContain("Ran out of gold foil, switching to backup roll.");
  });

  it("tells the admin who moved an order and to what status", () => {
    const rendered = renderTemplate("admin_order_status_changed", "en", {
      ...VARS,
      employeeName: "Mariam Khalid",
      statusLabel: "Ready for Pickup",
    });
    expect(rendered).toContain("Mariam Khalid");
    expect(rendered).toContain("Ready for Pickup");
  });

  // An order number alone doesn't tell the manager whose job it is, which
  // is the whole point of naming the customer in the admin alerts.
  it("names the customer in both admin alerts", () => {
    const statusChange = renderTemplate("admin_order_status_changed", "en", {
      ...VARS,
      employeeName: "Mariam Khalid",
      statusLabel: "Ready for Pickup",
    });
    const noteAdded = renderTemplate("admin_order_note_added", "en", {
      ...VARS,
      employeeName: "Hassan Youssef",
      noteText: "Switching to backup roll.",
    });

    expect(statusChange).toContain(VARS.customerName);
    expect(noteAdded).toContain(VARS.customerName);
  });
});
