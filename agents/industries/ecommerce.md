---
name: E-Commerce Industry Specialist
tier: industries
triggers: ecommerce, e-commerce, catalog, cart, checkout, inventory, shipping, returns, product management, sku, order management, fulfillment, shopping cart, storefront, tax calculation, product variants, warehouse
depends_on: database.md, auth.md, billing.md, search.md
conflicts_with: null
prerequisites: null
description: E-commerce domain expertise — product catalog with variants/SKUs, shopping cart, multi-step checkout, inventory management, order lifecycle, shipping integration, tax calculation, returns/refunds, and storefront patterns
code_templates: null
design_tokens: tokens-saas.css
---

# E-Commerce Industry Specialist

## Role

Provides deep domain expertise for building e-commerce applications — product catalogs, shopping carts, checkout flows, order management, inventory tracking, and fulfillment. Understands the complex data models behind product variants, SKU management, pricing rules, tax calculation, shipping rate integration, and the multi-state order lifecycle. Ensures every e-commerce app handles the edge cases that break most implementations: inventory races, abandoned carts, partial fulfillment, tax nexus, and return logistics.

## When to Use

- Building a product catalog with variants, options, and SKUs
- Implementing a shopping cart with persistence and price validation
- Building multi-step checkout (cart → shipping → payment → confirmation)
- Implementing inventory management with stock tracking and reservations
- Building order management with fulfillment workflows
- Implementing shipping rate calculation and label generation
- Building tax calculation with nexus rules
- Implementing returns, refunds, and exchange workflows
- Building customer accounts with order history and wishlists
- Designing marketplace features (multi-vendor)

## Also Consider

- **billing.md** — for Stripe payment processing in checkout
- **search.md** — for product search with faceted filtering
- **email.md** — for order confirmations, shipping notifications, and abandoned cart recovery
- **notifications.md** — for order status updates and back-in-stock alerts
- **cms.md** — for marketing pages, blog, and content alongside the store
- **dashboard.md** — for merchant admin dashboards and sales analytics
- **maps.md** — for store locators and delivery zone management

## Anti-Patterns (NEVER Do)

1. **Never trust client-side prices.** Always recalculate totals server-side at checkout. The cart price displayed to the user is a preview — the server is the source of truth.
2. **Never decrement inventory on add-to-cart.** Reserve inventory at checkout initiation or payment confirmation, not when the user adds to cart. Cart additions are speculative.
3. **Never store a single price per product.** Products need original price, sale price, cost price, compare-at price, and price-per-variant. Many products also need quantity breaks or customer-group pricing.
4. **Never hardcode tax rates.** Tax rates vary by jurisdiction, product category, and customer type. Use a tax calculation service (TaxJar, Avalara) or a well-maintained tax table.
5. **Never allow overselling without explicit configuration.** By default, the system should prevent orders for out-of-stock items. Overselling (accepting orders beyond stock) should be a deliberate merchant setting.
6. **Never skip idempotency on order creation.** Network retries and double-clicks can create duplicate orders. Use idempotency keys on the checkout endpoint.
7. **Never conflate products and variants.** A "Blue T-Shirt, Size M" is a variant (SKU) of the product "T-Shirt." Inventory, pricing, and images are tracked at the variant level, not the product level.
8. **Never delete products or orders.** Products should be archived/hidden; orders are permanent legal records. Use soft deletes and status fields.

## Standards & Patterns

### Core Data Model

```
Catalog:
├── Products
│   ├── Title, description, images, SEO metadata
│   ├── Options (Color, Size, Material — defining axes of variation)
│   ├── Variants (specific combinations: Blue/M, Red/L)
│   │   ├── SKU, barcode, price, weight
│   │   └── Inventory (quantity per location)
│   ├── Categories / Collections
│   └── Tags
├── Collections (curated or rule-based groupings)
└── Price Rules (sales, bulk discounts, customer-group pricing)

Cart & Checkout:
├── Cart (session-based or authenticated)
│   ├── Line Items (variant + quantity)
│   └── Applied discounts / coupons
├── Checkout
│   ├── Shipping address → Shipping method → Payment → Confirmation
│   └── Tax calculation at shipping step
└── Order
    ├── Line items (snapshot of prices at purchase time)
    ├── Payment records
    ├── Fulfillments (shipments)
    ├── Refunds / Returns
    └── Status lifecycle
```

### Product & Variant Schema

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  description_html TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  product_type TEXT,                     -- 'physical', 'digital', 'service'
  vendor TEXT,
  tags TEXT[] DEFAULT '{}',
  seo_title TEXT,
  seo_description TEXT,
  featured_image_url TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, slug)
);

-- Options define the axes of variation (e.g., Color, Size)
CREATE TABLE product_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- 'Color', 'Size'
  position INT NOT NULL DEFAULT 0,
  values TEXT[] NOT NULL,                -- ['Red', 'Blue', 'Green']
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Variants are specific option combinations with their own SKU + price
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT,
  barcode TEXT,
  title TEXT NOT NULL,                   -- 'Red / Medium'
  option_values JSONB NOT NULL,          -- {"Color": "Red", "Size": "Medium"}
  price DECIMAL(10,2) NOT NULL,
  compare_at_price DECIMAL(10,2),        -- Original price (for showing savings)
  cost_price DECIMAL(10,2),              -- What the merchant paid
  weight_grams INT,
  requires_shipping BOOLEAN NOT NULL DEFAULT true,
  is_taxable BOOLEAN NOT NULL DEFAULT true,
  tax_code TEXT,                         -- Product tax classification
  position INT NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_variants_sku ON product_variants(sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_variants_product ON product_variants(product_id, position);

-- Product images
CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id),
  url TEXT NOT NULL,
  alt_text TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Collections (categories)
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  sort_order INT DEFAULT 0,
  rule_type TEXT DEFAULT 'manual'        -- 'manual' or 'automated'
    CHECK (rule_type IN ('manual', 'automated')),
  rules JSONB,                           -- For automated: {"tag": "summer", "price_gt": 50}
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, slug)
);

CREATE TABLE product_collections (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, collection_id)
);
```

### Inventory Management

```sql
CREATE TABLE inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,                    -- 'Main Warehouse', 'Store Front'
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES inventory_locations(id),
  quantity INT NOT NULL DEFAULT 0,       -- Available quantity
  reserved INT NOT NULL DEFAULT 0,       -- Reserved for pending orders
  incoming INT NOT NULL DEFAULT 0,       -- Expected from purchase orders
  reorder_point INT,                     -- Alert when quantity drops below this
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(variant_id, location_id),
  CONSTRAINT non_negative_inventory CHECK (quantity >= 0)
);

-- Inventory movement log (append-only audit trail)
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  location_id UUID NOT NULL REFERENCES inventory_locations(id),
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('sale', 'return', 'adjustment', 'transfer_in',
      'transfer_out', 'receive', 'reserve', 'unreserve', 'damage', 'correction')),
  quantity INT NOT NULL,                 -- Positive = increase, Negative = decrease
  reference_type TEXT,                   -- 'order', 'return', 'purchase_order', 'manual'
  reference_id UUID,
  notes TEXT,
  performed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_levels_variant ON inventory_levels(variant_id);
CREATE INDEX idx_inv_movements_variant ON inventory_movements(variant_id, created_at DESC);
```

### Inventory Reservation Pattern

```typescript
// Reserve inventory at checkout — prevent overselling
async function reserveInventory(
  items: { variantId: string; quantity: number; locationId: string }[]
): Promise<{ success: boolean; failedItems?: string[] }> {
  const failedItems: string[] = [];

  // Use a transaction to ensure atomicity
  for (const item of items) {
    const { data, error } = await supabase.rpc('reserve_inventory', {
      p_variant_id: item.variantId,
      p_location_id: item.locationId,
      p_quantity: item.quantity,
    });

    if (error || !data) {
      failedItems.push(item.variantId);
    }
  }

  if (failedItems.length > 0) {
    // Roll back all reservations
    for (const item of items) {
      if (!failedItems.includes(item.variantId)) {
        await supabase.rpc('unreserve_inventory', {
          p_variant_id: item.variantId,
          p_location_id: item.locationId,
          p_quantity: item.quantity,
        });
      }
    }
    return { success: false, failedItems };
  }

  return { success: true };
}

/*
CREATE OR REPLACE FUNCTION reserve_inventory(
  p_variant_id UUID,
  p_location_id UUID,
  p_quantity INT
) RETURNS BOOLEAN AS $$
DECLARE
  available INT;
BEGIN
  -- Lock the row to prevent race conditions
  SELECT quantity - reserved INTO available
  FROM inventory_levels
  WHERE variant_id = p_variant_id AND location_id = p_location_id
  FOR UPDATE;

  IF available IS NULL OR available < p_quantity THEN
    RETURN false;
  END IF;

  UPDATE inventory_levels
  SET reserved = reserved + p_quantity, updated_at = now()
  WHERE variant_id = p_variant_id AND location_id = p_location_id;

  INSERT INTO inventory_movements (variant_id, location_id, movement_type, quantity)
  VALUES (p_variant_id, p_location_id, 'reserve', -p_quantity);

  RETURN true;
END;
$$ LANGUAGE plpgsql;
*/
```

### Shopping Cart

```sql
CREATE TABLE carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  customer_id UUID REFERENCES customers(id),   -- NULL for guest carts
  session_id TEXT,                               -- For guest identification
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'checkout', 'completed', 'abandoned')),
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  coupon_code TEXT,
  notes TEXT,
  shipping_address JSONB,
  billing_address JSONB,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL,     -- Price at time of add (recalculated at checkout)
  total_price DECIMAL(10,2) NOT NULL,
  properties JSONB,                      -- Custom properties (e.g., gift message, personalization)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(cart_id, variant_id)
);

CREATE INDEX idx_carts_customer ON carts(customer_id) WHERE status = 'active';
CREATE INDEX idx_carts_abandoned ON carts(updated_at) WHERE status = 'active';
```

### Order Schema

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  order_number TEXT NOT NULL,            -- Sequential: '#1001', '#1002'
  customer_id UUID REFERENCES customers(id),
  email TEXT NOT NULL,

  -- Financial snapshot (immutable after creation)
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal DECIMAL(10,2) NOT NULL,
  discount_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(10,2) NOT NULL,
  total_refunded DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'processing', 'partially_fulfilled',
      'fulfilled', 'delivered', 'cancelled', 'refunded')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'authorized', 'paid', 'partially_refunded',
      'refunded', 'voided', 'failed')),
  fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled'
    CHECK (fulfillment_status IN ('unfulfilled', 'partial', 'fulfilled', 'returned')),

  -- Addresses (snapshots — won't change if customer updates their address)
  shipping_address JSONB NOT NULL,
  billing_address JSONB NOT NULL,

  -- Shipping
  shipping_method TEXT,
  shipping_carrier TEXT,
  tracking_number TEXT,
  tracking_url TEXT,

  -- Payment
  stripe_payment_intent_id TEXT,
  coupon_code TEXT,
  discount_details JSONB,

  -- Metadata
  source TEXT DEFAULT 'web',             -- 'web', 'mobile', 'pos', 'api', 'phone'
  ip_address INET,
  user_agent TEXT,
  notes TEXT,                            -- Internal staff notes
  customer_notes TEXT,                   -- Notes from customer at checkout
  tags TEXT[] DEFAULT '{}',

  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  fulfilled_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,           -- Prevents duplicate order creation

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, order_number)
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  product_title TEXT NOT NULL,           -- Snapshot
  variant_title TEXT NOT NULL,           -- Snapshot
  sku TEXT,                              -- Snapshot
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,     -- Snapshot of price at purchase
  total_price DECIMAL(10,2) NOT NULL,
  total_discount DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  tax_rate DECIMAL(6,4),
  fulfilled_quantity INT NOT NULL DEFAULT 0,
  returned_quantity INT NOT NULL DEFAULT 0,
  properties JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(org_id, status, created_at DESC);
CREATE INDEX idx_orders_number ON orders(org_id, order_number);
```

### Order Lifecycle

```
Order Status Flow:
pending → confirmed → processing → fulfilled → delivered
                  ↘ cancelled
                  ↘ partially_fulfilled → fulfilled → delivered

Payment Status Flow:
pending → authorized → paid → (partially_refunded | refunded)
      ↘ failed                ↘ voided

Fulfillment Status Flow:
unfulfilled → partial → fulfilled
                     ↘ returned
```

### Checkout Flow

```typescript
// Server-side checkout — never trust client-side calculations
async function processCheckout(cartId: string, paymentMethodId: string): Promise<Order> {
  // 1. Load and validate cart
  const cart = await loadCartWithItems(cartId);
  if (!cart || cart.items.length === 0) throw new Error('Cart is empty');

  // 2. Recalculate prices server-side
  const pricing = await calculatePricing(cart);

  // 3. Check inventory availability
  const inventoryCheck = await checkAllInventory(cart.items);
  if (!inventoryCheck.allAvailable) {
    throw new OutOfStockError(inventoryCheck.unavailableItems);
  }

  // 4. Reserve inventory
  const reservation = await reserveInventory(cart.items.map((i) => ({
    variantId: i.variant_id,
    quantity: i.quantity,
    locationId: getDefaultLocationId(),
  })));
  if (!reservation.success) {
    throw new OutOfStockError(reservation.failedItems!);
  }

  // 5. Create payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(pricing.grandTotal * 100),
    currency: cart.currency.toLowerCase(),
    payment_method: paymentMethodId,
    confirm: true,
    idempotency_key: `checkout_${cartId}`,
    metadata: { cart_id: cartId },
  });

  if (paymentIntent.status !== 'succeeded') {
    // Release inventory reservation
    await unreserveInventory(cart.items);
    throw new PaymentError('Payment failed');
  }

  // 6. Create order
  const order = await createOrder({
    cart,
    pricing,
    paymentIntentId: paymentIntent.id,
    idempotencyKey: `order_${cartId}`,
  });

  // 7. Deduct inventory (convert reservation to sale)
  await confirmInventoryDeduction(cart.items);

  // 8. Mark cart as completed
  await updateCartStatus(cartId, 'completed');

  // 9. Send confirmation email (async)
  await queueOrderConfirmationEmail(order.id);

  return order;
}
```

### Discount / Coupon System

```sql
CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL
    CHECK (discount_type IN ('percentage', 'fixed_amount', 'free_shipping', 'buy_x_get_y')),
  discount_value DECIMAL(10,2) NOT NULL, -- Percentage (0-100) or fixed amount
  minimum_order_amount DECIMAL(10,2),
  maximum_discount_amount DECIMAL(10,2), -- Cap for percentage discounts
  applies_to TEXT DEFAULT 'all'          -- 'all', 'specific_products', 'specific_collections'
    CHECK (applies_to IN ('all', 'specific_products', 'specific_collections')),
  applicable_ids UUID[],                 -- Product or collection IDs
  usage_limit INT,                       -- Total uses allowed
  usage_count INT NOT NULL DEFAULT 0,
  per_customer_limit INT DEFAULT 1,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, code)
);
```

### Returns & Refunds

```sql
CREATE TABLE returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  return_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'shipped', 'received', 'inspected',
      'refunded', 'rejected', 'cancelled')),
  reason TEXT NOT NULL,
  customer_notes TEXT,
  staff_notes TEXT,
  refund_amount DECIMAL(10,2),
  refund_method TEXT CHECK (refund_method IN ('original_payment', 'store_credit', 'exchange')),
  return_shipping_label_url TEXT,
  tracking_number TEXT,
  received_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  quantity INT NOT NULL,
  reason TEXT NOT NULL,
  condition TEXT CHECK (condition IN ('new', 'like_new', 'used', 'damaged', 'defective')),
  restock BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Code Templates

No dedicated code templates — the inline patterns provide comprehensive schemas and logic for the full e-commerce workflow from catalog to fulfillment.

## Checklist

- [ ] Products and variants properly separated (variant = SKU level)
- [ ] Product options support multiple axes of variation
- [ ] Inventory tracked at variant × location level with reservation system
- [ ] Inventory reservations use `SELECT ... FOR UPDATE` to prevent race conditions
- [ ] Cart persists for both authenticated and guest users
- [ ] All prices recalculated server-side at checkout (never trust client)
- [ ] Checkout uses idempotency keys to prevent duplicate orders
- [ ] Order items snapshot product data at time of purchase (price, title, SKU)
- [ ] Tax calculation respects jurisdiction, product type, and customer exemptions
- [ ] Shipping address collected before tax calculation (nexus-dependent)
- [ ] Order lifecycle states clearly defined with valid transitions
- [ ] Returns workflow with inspection, restocking, and refund processing
- [ ] Coupon/discount system with usage limits and expiration
- [ ] Abandoned cart detection and recovery emails
- [ ] Product soft deletes only (archive, never delete)
- [ ] Order records immutable (permanent legal/financial records)

## Common Pitfalls

1. **Inventory race conditions** — Two customers checking out the last item simultaneously. Without `SELECT ... FOR UPDATE` or atomic decrement operations, both orders can succeed and you've oversold. This is the most common e-commerce bug.
2. **Price snapshot timing** — Cart prices must be re-validated at checkout. If a product's price changed between add-to-cart and checkout, the customer should see the updated price.
3. **Tax nexus complexity** — You only owe sales tax in states where you have "nexus" (physical or economic presence). Economic nexus thresholds vary by state ($100K revenue or 200 transactions is common). This is a legal minefield.
4. **Partial fulfillment** — An order with 3 items where only 2 are in stock needs partial shipment handling. The order splits into multiple fulfillments with independent tracking numbers.
5. **Guest checkout to account merge** — A guest places an order, then creates an account with the same email. The previous order should be linked to their new account.
6. **International shipping** — Customs declarations, harmonized tariff codes, duties calculation, and restricted item lists. International e-commerce is significantly more complex than domestic.
7. **Product variant explosion** — A product with 5 colors × 5 sizes × 3 materials = 75 variants. The UI must handle this gracefully without overwhelming the shopper or the merchant's inventory management.
