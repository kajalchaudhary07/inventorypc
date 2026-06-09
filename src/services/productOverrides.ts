/**
 * Product Overrides Storage Service
 * Manages frontend-only persistent overrides for App Products using localStorage
 * Overrides are keyed by product ID and stored separately from backend data
 */

export interface ProductOverride {
  costPrice?: number;
  sellingPrice?: number;
  stock?: number;
  reorderLevel?: number;
  updatedAt?: number;
}

export interface StoredOverrides {
  [productId: string]: ProductOverride;
}

const STORAGE_KEY = "purecuts_product_overrides";

/**
 * Get all stored overrides
 */
export function getStoredOverrides(): StoredOverrides {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error("Failed to read product overrides from localStorage:", error);
    return {};
  }
}

/**
 * Get override for a specific product
 */
export function getProductOverride(productId: string): ProductOverride | null {
  const overrides = getStoredOverrides();
  return overrides[productId] || null;
}

/**
 * Save/update override for a product
 */
export function saveProductOverride(productId: string, override: ProductOverride): void {
  try {
    const overrides = getStoredOverrides();
    overrides[productId] = {
      ...overrides[productId],
      ...override,
      updatedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (error) {
    console.error("Failed to save product override to localStorage:", error);
  }
}

/**
 * Delete override for a product
 */
export function deleteProductOverride(productId: string): void {
  try {
    const overrides = getStoredOverrides();
    delete overrides[productId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (error) {
    console.error("Failed to delete product override from localStorage:", error);
  }
}

/**
 * Clear all overrides
 */
export function clearAllOverrides(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear product overrides from localStorage:", error);
  }
}

/**
 * Merge product with its stored overrides
 * Returns a new object with original data + applied overrides
 */
export function mergeProductWithOverrides<T extends Record<string, unknown>>(
  product: T,
  override: ProductOverride | null
): T {
  if (!override) return product;

  const merged = { ...product };
  if (override.costPrice !== undefined) (merged as any).costPrice = override.costPrice;
  if (override.sellingPrice !== undefined) (merged as any).sellingPrice = override.sellingPrice;
  if (override.stock !== undefined) (merged as any).stock = override.stock;
  if (override.reorderLevel !== undefined) (merged as any).reorderLevel = override.reorderLevel;
  return merged;
}

/**
 * Get merged product data (original + overrides)
 */
export function getMergedProduct<T extends Record<string, unknown>>(product: T): T {
  const override = getProductOverride(String(product.id || ""));
  return mergeProductWithOverrides(product, override);
}

/**
 * Get all merged products with their overrides applied
 */
export function getMergedProducts<T extends Record<string, unknown>>(products: T[]): T[] {
  const overrides = getStoredOverrides();
  return products.map((product) => {
    const productId = String(product.id || "");
    return mergeProductWithOverrides(product, overrides[productId] || null);
  });
}
