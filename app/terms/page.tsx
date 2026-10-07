import type { Metadata } from "next";

import { LegalPage } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Terms of Use — Prime Printing Co.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="October 2026">
      <p>
        Prime Flow is a private, internal application operated by Prime Printing Co., Kuwait, for managing our own print
        production. It is not offered to the public as a service, and access is limited to our authorized staff.
      </p>
      <h2>Use of the system</h2>
      <ul>
        <li>Access is granted only to Prime Printing Co. employees with individual logins. Sharing a login is not permitted.</li>
        <li>The system connects to our accounting software (QuickBooks Online) to read invoices so that paid orders appear on the production board. It reads invoice and customer details only for that purpose.</li>
        <li>Customers interact with the system only through links we send them (e.g. a design-approval link or an order-request form). Submitting a form or approving a design constitutes your instruction to proceed with the order as described.</li>
      </ul>
      <h2>Orders</h2>
      <p>
        An order placed through our website, an invoice, or an order-request link is confirmed only once reviewed and
        approved by Prime Printing Co. Production specifications, delivery dates, and pricing are as agreed on the
        invoice or confirmed with you directly.
      </p>
      <h2>Liability</h2>
      <p>
        The system is provided for operating our business. Prime Printing Co. is not liable for delays or losses caused
        by third-party services (hosting, messaging, courier, or accounting providers) beyond our reasonable control.
      </p>
      <h2>Privacy</h2>
      <p>
        How we handle your information is described in our <a href="/privacy">Privacy Policy</a>.
      </p>
      <h2>Contact</h2>
      <p>Prime Printing Co. — reemprimeco@gmail.com</p>
    </LegalPage>
  );
}
