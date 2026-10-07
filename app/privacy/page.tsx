import type { Metadata } from "next";

import { LegalPage } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — Prime Printing Co.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 2026">
      <p>
        Prime Flow is the internal production board of Prime Printing Co., Kuwait. It is used by our own staff to
        manage print orders. This page describes what information the system holds and how it is used.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Order details: product, quantity, specifications, delivery date, delivery address, and artwork files you provide.</li>
        <li>Contact details: your name and mobile number, used to send order updates (e.g. on WhatsApp) and to arrange pickup or delivery.</li>
        <li>Invoice information from our accounting system (QuickBooks Online): invoice number, line items, amounts, and payment status, used solely to create and track your order.</li>
      </ul>
      <h2>How we use it</h2>
      <p>
        Only to produce, track, and deliver your order and to communicate with you about it. We do not sell or share
        your information with third parties, except service providers strictly needed to operate the system (hosting,
        database, messaging, and courier services) and only for that purpose.
      </p>
      <h2>Storage and security</h2>
      <p>
        Data is stored in an access-controlled database encrypted at rest, transmitted over HTTPS only, and is accessible
        only to authorized Prime Printing Co. staff. Accounting-system credentials are held server-side and are never
        exposed to browsers or end users.
      </p>
      <h2>Retention and your rights</h2>
      <p>
        Order records are kept for our business and accounting records. You may ask us at any time to review, correct,
        or delete your personal information by contacting us at the details below.
      </p>
      <h2>Contact</h2>
      <p>Prime Printing Co. — reemprimeco@gmail.com</p>
    </LegalPage>
  );
}
