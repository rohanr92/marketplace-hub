export default function Privacy() {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px", lineHeight: 1.6, color: "#1a1a1a", fontFamily: "system-ui, sans-serif" }}>
      <h1>Privacy Policy</h1>
      <p style={{ color: "#666" }}>Last updated: July 1, 2026</p>

      <p>Marketplace Hub ("we", "us", "the app") connects a merchant's Shopify store with third-party marketplaces to synchronize products, inventory, orders, and fulfillment. This policy explains what data we access, how we use it, and how to request its deletion.</p>

      <h2>Information we access</h2>
      <p>When a merchant installs Marketplace Hub on their Shopify store and authorizes access, we access the following through Shopify's APIs, solely to provide the app's functionality:</p>
      <ul>
        <li><strong>Products and inventory:</strong> product titles, variants, SKUs, barcodes, prices, and inventory levels, used to synchronize stock between Shopify and connected marketplaces.</li>
        <li><strong>Orders:</strong> order details and line items, used to import marketplace orders into Shopify and to push fulfillment and tracking information back.</li>
        <li><strong>Fulfillments and locations:</strong> fulfillment status, tracking numbers, and store locations, used to keep marketplace and Shopify fulfillment in sync.</li>
      </ul>
      <p>We access the minimum data necessary to operate the synchronization features the merchant has enabled.</p>

      <h2>How we use data</h2>
      <p>Data is used exclusively to provide the app's core function: synchronizing catalog, inventory, orders, and fulfillment between a merchant's Shopify store and the marketplaces they connect. We do not sell, rent, or share merchant or customer data with third parties for advertising or any unrelated purpose.</p>

      <h2>Data storage and security</h2>
      <p>Access tokens and credentials are encrypted at rest. Data is transmitted over HTTPS. We retain only the data needed to operate the app and to keep synchronization accurate.</p>

      <h2>Customer data requests and deletion</h2>
      <p>We comply with Shopify's mandatory data protection webhooks:</p>
      <ul>
        <li><strong>Customer data request:</strong> if a store customer requests their data, we respond to the request relayed by Shopify. Marketplace Hub does not retain customer personal data beyond what is required to pass an order between systems.</li>
        <li><strong>Customer redaction:</strong> upon request, we delete any customer-related data associated with the request.</li>
        <li><strong>Shop redaction:</strong> when a merchant uninstalls the app, we deactivate their connection and erase their store's data from our systems following Shopify's redaction request.</li>
      </ul>
      <p>To request access to or deletion of your data, contact us at the email below.</p>

      <h2>Uninstalling</h2>
      <p>When the app is uninstalled, synchronization stops immediately and the store's connection is deactivated. Stored data for that store is erased upon receipt of Shopify's shop redaction request.</p>

      <h2>Contact</h2>
      <p>For privacy questions or data requests, contact: <strong>rohan@rohanofficial.com</strong></p>
    </div>
  );
}
