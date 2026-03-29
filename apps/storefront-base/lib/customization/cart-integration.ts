// =====================================================
// CART INTEGRATION
// Functions to handle customization in cart
// =====================================================

import { createServerClient } from "@/lib/supabase";
import {
  PriceBreakdown,
  CustomizationSchema,
  CustomizationStep,
  CartItemCustomization,
} from "@/types/product-customization";

interface AddToCartWithCustomizationParams {
  cartId: string;
  productId: string;
  variantId: string;
  quantity: number;
  schemaId: string;
  selections: Record<string, unknown>;
  priceBreakdown: PriceBreakdown;
  customTextContent?: string;
  uploadedFiles?: Array<{
    file_url: string;
    file_name: string;
    file_type: string;
    file_size: number;
  }>;
}

/**
 * Add item to cart with customization
 */
export async function addToCartWithCustomization({
  cartId,
  productId,
  variantId,
  quantity,
  schemaId,
  selections,
  priceBreakdown,
  customTextContent,
  uploadedFiles,
}: AddToCartWithCustomizationParams): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  try {
    // 1. Get or create cart item
    const { data: cartItem, error: cartItemError } = await supabase
      .from("cart_items")
      .insert({
        cart_id: cartId,
        product_id: productId,
        variant_id: variantId,
        quantity,
      })
      .select()
      .single();

    if (cartItemError) throw cartItemError;

    // 2. Get schema snapshot
    const { data: schema, error: schemaError } = await supabase
      .from("product_customization_schemas")
      .select(`
        *,
        steps:product_customization_steps(
          *,
          options:product_customization_options(*)
        )
      `)
      .eq("id", schemaId)
      .single();

    if (schemaError) throw schemaError;

    // 3. Format selections for storage
    const formattedSelections = Object.entries(selections).map(([key, value]) => {
      const step = schema.steps?.find((s: any) => s.key === key);
      let displayValue = String(value);
      
      if (step?.options) {
        const option = step.options.find((o: any) => o.value === value);
        if (option) displayValue = option.label;
      }

      return {
        step_id: step?.id || "",
        step_key: key,
        step_label: step?.label || key,
        type: step?.type || "text",
        value,
        display_value: displayValue,
        price_adjustment: 0, // Will be calculated from price_breakdown
      };
    });

    // 4. Create cart item customization
    const { error: customizationError } = await supabase
      .from("cart_item_customizations")
      .insert({
        cart_item_id: cartItem.id,
        schema_id: schemaId,
        schema_snapshot: schema,
        selections: formattedSelections,
        price_breakdown: priceBreakdown,
        custom_text_content: customTextContent,
        uploaded_files: uploadedFiles || [],
      });

    if (customizationError) throw customizationError;

    return { success: true };
  } catch (error: any) {
    console.error("Error adding to cart with customization:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get cart items with customizations
 */
export async function getCartItemsWithCustomizations(cartId: string) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("cart_items")
    .select(`
      *,
      product:products(*),
      variant:product_variants(*),
      customizations:cart_item_customizations(*)
    `)
    .eq("cart_id", cartId);

  if (error) {
    console.error("Error fetching cart items:", error);
    return [];
  }

  return data || [];
}

/**
 * Update cart item customization
 */
export async function updateCartItemCustomization(
  customizationId: string,
  updates: Partial<CartItemCustomization>
) {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("cart_item_customizations")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customizationId);

  if (error) {
    console.error("Error updating customization:", error);
    return false;
  }

  return true;
}

/**
 * Remove customization from cart item
 */
export async function removeCartItemCustomization(customizationId: string) {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("cart_item_customizations")
    .delete()
    .eq("id", customizationId);

  if (error) {
    console.error("Error removing customization:", error);
    return false;
  }

  return true;
}

/**
 * Clone cart item customizations for order
 */
export async function cloneCustomizationsForOrder(
  cartItemId: string,
  orderItemId: string
) {
  const supabase = createServerClient();

  try {
    // Get cart item customizations
    const { data: customizations, error: fetchError } = await supabase
      .from("cart_item_customizations")
      .select("*")
      .eq("cart_item_id", cartItemId);

    if (fetchError) throw fetchError;

    if (!customizations || customizations.length === 0) {
      return true;
    }

    // Insert into order_item_customizations
    const { error: insertError } = await supabase
      .from("order_item_customizations")
      .insert(
        customizations.map((c) => ({
          order_item_id: orderItemId,
          schema_id: c.schema_id,
          schema_snapshot: c.schema_snapshot,
          schema_version: 1,
          selections: c.selections,
          price_breakdown: c.price_breakdown,
          custom_text_content: c.custom_text_content,
          uploaded_files: c.uploaded_files,
          production_status: "pending",
        }))
      );

    if (insertError) throw insertError;

    return true;
  } catch (error) {
    console.error("Error cloning customizations for order:", error);
    return false;
  }
}
