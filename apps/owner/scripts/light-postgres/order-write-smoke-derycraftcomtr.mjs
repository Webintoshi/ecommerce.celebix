import process from "node:process";
import { Pool } from "pg";

function readEnv(name) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    cleanup: argv.includes("--cleanup"),
    store:
      argv.includes("--store") && argv[argv.indexOf("--store") + 1]
        ? argv[argv.indexOf("--store") + 1]
        : "derycraftcomtr",
    prefix:
      argv.includes("--prefix") && argv[argv.indexOf("--prefix") + 1]
        ? argv[argv.indexOf("--prefix") + 1]
        : "atlas-test-derycraftcomtr-order-",
  };
}

function resolveConnectionString() {
  const rawUrl =
    readEnv("OWNER_LIGHT_POSTGRES_DATABASE_URL") ??
    readEnv("LIGHT_POSTGRES_DATABASE_URL");

  if (!rawUrl) {
    throw new Error("LIGHT_POSTGRES_DATABASE_URL tanimli degil.");
  }

  const databaseName =
    readEnv("OWNER_LIGHT_POSTGRES_DATABASE_NAME") ??
    readEnv("LIGHT_POSTGRES_DATABASE_NAME");

  if (!databaseName) {
    return rawUrl;
  }

  const parsed = new URL(rawUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function resolveSsl() {
  const sslMode =
    readEnv("OWNER_LIGHT_POSTGRES_DATABASE_SSLMODE") ??
    readEnv("LIGHT_POSTGRES_DATABASE_SSLMODE");

  return sslMode?.toLowerCase() === "disable"
    ? false
    : { rejectUnauthorized: false };
}

async function query(pool, text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

async function getCounts(pool) {
  const [counts] = await query(
    pool,
    `
      select
        (select count(*) from public.customers) as customers,
        (select count(*) from public.customer_addresses) as customer_addresses,
        (select count(*) from public.orders) as orders,
        (select count(*) from public.order_items) as order_items,
        (select count(*) from public.payments) as payments,
        (select count(*) from public.payment_events) as payment_events
    `,
  );

  return counts ?? null;
}

async function cleanupSmokeData(pool, prefix) {
  const emailPattern = `${prefix}%@example.invalid`;
  const orderPattern = `${prefix}%`;
  const paymentKeyPattern = `${prefix}%`;

  await pool.query(
    `
      delete from public.payment_events
      where payment_id in (
        select id
        from public.payments
        where idempotency_key like $1
           or customer_email like $2
           or order_id in (
             select id from public.orders where order_number like $3
           )
      )
         or order_id in (
           select id from public.orders where order_number like $3
         )
    `,
    [paymentKeyPattern, emailPattern, orderPattern],
  );

  await pool.query(
    `
      delete from public.payments
      where idempotency_key like $1
         or customer_email like $2
         or order_id in (
           select id from public.orders where order_number like $3
         )
    `,
    [paymentKeyPattern, emailPattern, orderPattern],
  );

  await pool.query(
    `
      delete from public.order_status_history
      where order_id in (
        select id from public.orders where order_number like $1
      )
    `,
    [orderPattern],
  );

  await pool.query("delete from public.orders where order_number like $1", [orderPattern]);
  await pool.query(
    "delete from public.customer_addresses where customer_id in (select id from public.customers where email like $1)",
    [emailPattern],
  );
  await pool.query("delete from public.customers where email like $1", [emailPattern]);
}

async function run() {
  const args = parseArgs(process.argv);

  if (args.store !== "derycraftcomtr") {
    throw new Error("Bu smoke harness yalnizca derycraftcomtr icin tasarlandi.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `${args.prefix}${timestamp}`;
  const customerEmail = `${prefix}@example.invalid`;
  const orderNumber = `${prefix}-order`;
  const paymentKey = `${prefix}-payment`;
  const paymentReference = `${prefix}-ref`;

  const pool = new Pool({
    connectionString: resolveConnectionString(),
    ssl: resolveSsl(),
    max: 1,
    idleTimeoutMillis: 5_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    application_name: "celebix-owner-order-write-smoke",
  });

  try {
    if (!args.apply) {
      console.log(
        JSON.stringify(
          {
            mode: "dry-run",
            store: args.store,
            plan: {
              customerEmail,
              orderNumber,
              paymentKey,
              cleanupWith: `node apps/owner/scripts/light-postgres/order-write-smoke-derycraftcomtr.mjs --apply --cleanup --prefix ${args.prefix}`,
            },
          },
          null,
          2,
        ),
      );
      return;
    }

    if (args.cleanup) {
      await cleanupSmokeData(pool, args.prefix);
      console.log(
        JSON.stringify(
          {
            success: true,
            mode: "cleanup",
            prefix: args.prefix,
            countsAfterCleanup: await getCounts(pool),
          },
          null,
          2,
        ),
      );
      return;
    }

    const countsBefore = await getCounts(pool);

    const [insertedCustomer] = await query(
      pool,
      `
        insert into public.customers (
          email,
          first_name,
          last_name,
          phone,
          status,
          notes,
          tags
        )
        values ($1, $2, $3, $4, 'active', $5, $6::text[])
        returning id, email, status, created_at
      `,
      [
        customerEmail,
        "Atlas",
        "Order Smoke",
        "+90 555 000 00 00",
        `${prefix} guest customer`,
        [prefix, "order-smoke"],
      ],
    );

    const [insertedAddress] = await query(
      pool,
      `
        insert into public.customer_addresses (
          customer_id,
          type,
          title,
          first_name,
          last_name,
          phone,
          address,
          address_line1,
          city,
          district,
          state,
          postal_code,
          country,
          is_default
        )
        values (
          $1::uuid,
          'shipping',
          'Atlas Test Address',
          'Atlas',
          'Order Smoke',
          '+90 555 000 00 00',
          'Atlas Test Mahallesi 1',
          'Atlas Test Mahallesi 1',
          'Istanbul',
          'Kadikoy',
          'Kadikoy',
          '34710',
          'TR',
          true
        )
        returning id, customer_id, city, district
      `,
      [insertedCustomer.id],
    );

    const shippingAddress = {
      firstName: "Atlas",
      lastName: "Order Smoke",
      phone: "+90 555 000 00 00",
      address: "Atlas Test Mahallesi 1",
      city: "Istanbul",
      district: "Kadikoy",
      postalCode: "34710",
      country: "TR",
    };

    const [insertedOrder] = await query(
      pool,
      `
        insert into public.orders (
          order_number,
          customer_id,
          status,
          subtotal,
          shipping_cost,
          discount,
          total,
          shipping_address,
          billing_address,
          payment_method,
          payment_status,
          notes,
          source_type
        )
        values (
          $1,
          $2::uuid,
          'pending',
          199.90,
          20.00,
          0,
          219.90,
          $3::jsonb,
          $3::jsonb,
          'craftgate',
          'pending',
          $4,
          'storefront_checkout'
        )
        returning id, order_number, status, payment_status, total
      `,
      [
        orderNumber,
        insertedCustomer.id,
        JSON.stringify(shippingAddress),
        `${prefix} guest order`,
      ],
    );

    const [insertedOrderItem] = await query(
      pool,
      `
        insert into public.order_items (
          order_id,
          product_id,
          variant_id,
          product_name,
          variant_name,
          price,
          quantity,
          total
        )
        values (
          $1::uuid,
          null,
          null,
          $2,
          $3,
          $4,
          $5,
          $6
        )
        returning id, order_id, product_name, variant_name, price, quantity, total
      `,
      [
        insertedOrder.id,
        `${prefix} product`,
        `${prefix} variant`,
        199.9,
        1,
        199.9,
      ],
    );

    const [insertedPayment] = await query(
      pool,
      `
        insert into public.payments (
          order_id,
          gateway_id,
          provider,
          status,
          amount,
          currency,
          idempotency_key,
          customer_email,
          customer_ip,
          request_payload
        )
        values (
          $1::uuid,
          'craftgate-default',
          'craftgate',
          'initiated',
          219.90,
          'TRY',
          $2,
          $3,
          '127.0.0.1',
          $4::jsonb
        )
        returning id, order_id, provider, status, idempotency_key
      `,
      [
        insertedOrder.id,
        paymentKey,
        customerEmail,
        JSON.stringify({ source: "order-write-smoke", prefix }),
      ],
    );

    const [updatedPayment] = await query(
      pool,
      `
        update public.payments
        set
          status = 'authorized',
          provider_reference_id = $2,
          response_payload = $3::jsonb,
          updated_at = now()
        where id = $1::uuid
        returning id, status, provider_reference_id
      `,
      [
        insertedPayment.id,
        paymentReference,
        JSON.stringify({ authorizedAt: new Date().toISOString(), prefix }),
      ],
    );

    const [updatedOrder] = await query(
      pool,
      `
        update public.orders
        set
          payment_status = 'processing',
          updated_at = now()
        where id = $1::uuid
        returning id, order_number, payment_status
      `,
      [insertedOrder.id],
    );

    const [paymentEvent] = await query(
      pool,
      `
        insert into public.payment_events (
          provider,
          gateway_id,
          payment_id,
          order_id,
          event_type,
          status,
          payload,
          processed_at
        )
        values (
          'craftgate',
          'craftgate-default',
          $1::uuid,
          $2::uuid,
          'authorization',
          'processed',
          $3::jsonb,
          now()
        )
        returning id, payment_id, order_id, event_type, status
      `,
      [
        insertedPayment.id,
        insertedOrder.id,
        JSON.stringify({ source: "order-write-smoke", prefix }),
      ],
    );

    const [readBackCustomer] = await query(
      pool,
      `
        select
          c.id,
          c.email,
          c.status,
          c.total_orders,
          c.total_spent,
          json_agg(
            json_build_object(
              'id', a.id,
              'city', a.city,
              'district', a.district,
              'is_default', a.is_default
            )
          ) filter (where a.id is not null) as addresses
        from public.customers c
        left join public.customer_addresses a on a.customer_id = c.id
        where c.id = $1::uuid
        group by c.id
      `,
      [insertedCustomer.id],
    );

    const [readBackOrder] = await query(
      pool,
      `
        select
          o.id,
          o.order_number,
          o.status,
          o.payment_status,
          o.total,
          json_agg(
            json_build_object(
              'id', i.id,
              'product_name', i.product_name,
              'variant_name', i.variant_name,
              'quantity', i.quantity,
              'total', i.total
            )
          ) filter (where i.id is not null) as items
        from public.orders o
        left join public.order_items i on i.order_id = o.id
        where o.id = $1::uuid
        group by o.id
      `,
      [insertedOrder.id],
    );

    const [readBackPayment] = await query(
      pool,
      `
        select
          p.id,
          p.order_id,
          p.status,
          p.provider_reference_id,
          count(e.id)::int as event_count
        from public.payments p
        left join public.payment_events e on e.payment_id = p.id
        where p.id = $1::uuid
        group by p.id
      `,
      [insertedPayment.id],
    );

    console.log(
      JSON.stringify(
        {
          success: true,
          mode: "apply",
          store: args.store,
          countsBefore,
          created: {
            customer: insertedCustomer,
            address: insertedAddress,
            order: insertedOrder,
            orderItem: insertedOrderItem,
            payment: insertedPayment,
            updatedPayment,
            updatedOrder,
            paymentEvent,
          },
          readBack: {
            customer: readBackCustomer ?? null,
            order: readBackOrder ?? null,
            payment: readBackPayment ?? null,
          },
          countsAfter: await getCounts(pool),
          cleanupHint: `node apps/owner/scripts/light-postgres/order-write-smoke-derycraftcomtr.mjs --apply --cleanup --prefix ${args.prefix}`,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
