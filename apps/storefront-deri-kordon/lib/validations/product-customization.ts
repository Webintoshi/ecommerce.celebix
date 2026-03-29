// =====================================================
// PRODUCT CUSTOMIZATION - ZOD VALIDATION SCHEMAS
// =====================================================

import { z } from 'zod';
import { CustomizationStepType, PriceAdjustmentType, GridWidth, ConditionOperator, LogicalOperator } from '@/types/product-customization';

// =====================================================
// 1. CONDITIONAL LOGIC VALIDATION
// =====================================================

export const showConditionSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    step_key: z.string().min(1, 'Step key gereklidir'),
    operator: z.enum([
      'equals', 'not_equals', 'contains', 'not_contains',
      'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal',
      'is_empty', 'is_not_empty', 'matches_regex'
    ] as const),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  })
);

export const conditionalLogicGroupSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    operator: z.enum(['and', 'or'] as const),
    conditions: z.array(
      z.union([showConditionSchema, conditionalLogicGroupSchema])
    ),
  })
);

// =====================================================
// 2. VALIDATION RULES
// =====================================================

export const validationRulesSchema = z.object({
  min_length: z.number().min(0).optional(),
  max_length: z.number().min(0).optional(),
  pattern: z.string().optional(),
  min_value: z.number().optional(),
  max_value: z.number().optional(),
  min_date: z.string().optional(),
  max_date: z.string().optional(),
  allowed_file_types: z.array(z.string()).optional(),
  max_file_size: z.number().min(0).optional(),
  min_selections: z.number().min(0).optional(),
  max_selections: z.number().min(0).optional(),
  custom_error_message: z.string().optional(),
}).refine(
  (data) => {
    if (data.min_length !== undefined && data.max_length !== undefined) {
      return data.min_length <= data.max_length;
    }
    return true;
  },
  { message: 'Min length max length\'den büyük olamaz', path: ['min_length'] }
).refine(
  (data) => {
    if (data.min_value !== undefined && data.max_value !== undefined) {
      return data.min_value <= data.max_value;
    }
    return true;
  },
  { message: 'Min value max value\'den büyük olamaz', path: ['min_value'] }
);

// =====================================================
// 3. STYLE CONFIG
// =====================================================

export const styleConfigSchema = z.object({
  label_position: z.enum(['top', 'left', 'hidden']).optional(),
  show_label: z.boolean().optional(),
  css_class: z.string().optional(),
  help_text_position: z.enum(['below_label', 'below_input']).optional(),
});

// =====================================================
// 4. PRICE CONFIGURATION
// =====================================================

export const stepOptionPriceConfigSchema = z.object({
  value: z.string().min(1, 'Değer gereklidir'),
  price_adjustment: z.number().default(0),
  type: z.enum(['fixed', 'percentage', 'multiplier']).default('fixed'),
});

export const stepPriceConfigSchema = z.object({
  base_price_adjustment: z.number().default(0),
  price_per_character: z.number().min(0).optional(),
  options: z.array(stepOptionPriceConfigSchema).optional(),
});

// =====================================================
// 5. CUSTOMIZATION OPTION
// =====================================================

export const customizationOptionSchema = z.object({
  id: z.string().uuid().optional(),
  step_id: z.string().uuid().optional(),
  
  label: z.string().min(1, 'Etiket gereklidir').max(255),
  value: z.string().min(1, 'Değer gereklidir').max(255).regex(
    /^[a-z0-9_]+$/,
    'Değer sadece küçük harf, rakam ve alt çizgi içerebilir'
  ),
  description: z.string().max(1000).optional(),
  
  image_url: z.string().url('Geçerli bir URL giriniz').optional().or(z.literal('')),
  icon: z.string().optional(),
  color: z.string().optional(),
  
  price_adjustment: z.number().default(0),
  price_adjustment_type: z.enum(['fixed', 'percentage', 'multiplier']).default('fixed'),
  
  stock_quantity: z.number().min(0).optional(),
  track_stock: z.boolean().default(false),
  
  show_conditions: conditionalLogicGroupSchema.optional(),
  
  sort_order: z.number().default(0),
  is_default: z.boolean().default(false),
  is_disabled: z.boolean().default(false),
  
  dependent_step_ids: z.array(z.string().uuid()).optional(),
});

// =====================================================
// 6. CUSTOMIZATION STEP
// =====================================================

export const customizationStepSchema = z.object({
  id: z.string().uuid().optional(),
  schema_id: z.string().uuid().optional(),
  
  type: z.enum([
    'select', 'radio_group', 'image_select', 'text', 'textarea',
    'checkbox', 'multi_select', 'file_upload', 'number', 'date', 'color_picker'
  ] as const),
  key: z.string()
    .min(1, 'Key gereklidir')
    .max(100)
    .regex(
      /^[a-z0-9_]+$/,
      'Key sadece küçük harf, rakam ve alt çizgi içerebilir'
    ),
  label: z.string().min(1, 'Etiket gereklidir').max(255),
  placeholder: z.string().max(255).optional(),
  help_text: z.string().max(1000).optional(),
  
  is_required: z.boolean().default(false),
  validation_rules: validationRulesSchema.default({}),
  
  grid_width: z.enum(['full', 'half', 'third', 'quarter']).default('full'),
  style_config: styleConfigSchema.default({}),
  
  show_conditions: conditionalLogicGroupSchema.optional(),
  
  price_config: stepPriceConfigSchema.optional(),
  
  default_value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  
  sort_order: z.number().default(0),
  
  options: z.array(customizationOptionSchema).optional(),
}).refine(
  (data) => {
    // If step type requires options, options must be provided
    const typesRequiringOptions: CustomizationStepType[] = ['select', 'radio_group', 'image_select', 'multi_select'];
    if (typesRequiringOptions.includes(data.type)) {
      return data.options && data.options.length > 0;
    }
    return true;
  },
  { message: 'Bu alan tipi için en az bir seçenek gereklidir', path: ['options'] }
).refine(
  (data) => {
    // Check for duplicate option values
    if (data.options && data.options.length > 0) {
      const values = data.options.map(o => o.value);
      return new Set(values).size === values.length;
    }
    return true;
  },
  { message: 'Seçenek değerleri benzersiz olmalıdır', path: ['options'] }
);

// =====================================================
// 7. CUSTOMIZATION SCHEMA
// =====================================================

export const customizationSchemaSettingsSchema = z.object({
  show_summary: z.boolean().default(true),
  show_price_breakdown: z.boolean().default(true),
  allow_multiple: z.boolean().default(false),
  max_selections: z.number().min(1).optional().nullable(),
  submit_button_text: z.string().max(100).default('Sepete Ekle'),
  success_message: z.string().max(500).default('Ürün sepete eklendi'),
});

export const customizationSchemaSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string()
    .min(1, 'İsim gereklidir')
    .max(255, 'İsim 255 karakterden uzun olamaz'),
  description: z.string().max(2000).optional(),
  slug: z.string()
    .min(1, 'Slug gereklidir')
    .max(255)
    .regex(
      /^[a-z0-9-]+$/,
      'Slug sadece küçük harf, rakam ve tire içerebilir'
    ),
  is_active: z.boolean().default(true),
  sort_order: z.number().default(0),
  
  settings: customizationSchemaSettingsSchema.default({}),
  
  steps: z.array(customizationStepSchema)
    .min(1, 'En az bir adım gereklidir')
    .refine(
      (steps) => {
        const keys = steps.map(s => s.key);
        return new Set(keys).size === keys.length;
      },
      { message: 'Step key\'leri benzersiz olmalıdır' }
    ),
});

// =====================================================
// 8. API REQUEST SCHEMAS
// =====================================================

export const createSchemaRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  settings: customizationSchemaSettingsSchema.optional(),
});

export const updateSchemaRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().optional(),
  settings: customizationSchemaSettingsSchema.optional(),
});

export const createStepRequestSchema = z.object({
  type: z.enum([
    'select', 'radio_group', 'image_select', 'text', 'textarea',
    'checkbox', 'multi_select', 'file_upload', 'number', 'date', 'color_picker'
  ] as const),
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(255),
  placeholder: z.string().max(255).optional(),
  help_text: z.string().max(1000).optional(),
  is_required: z.boolean().optional(),
  validation_rules: validationRulesSchema.optional(),
  grid_width: z.enum(['full', 'half', 'third', 'quarter']).optional(),
  style_config: styleConfigSchema.optional(),
  show_conditions: conditionalLogicGroupSchema.optional(),
  price_config: stepPriceConfigSchema.optional(),
  default_value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  sort_order: z.number().optional(),
});

export const createOptionRequestSchema = z.object({
  label: z.string().min(1).max(255),
  value: z.string().min(1).max(255).regex(/^[a-z0-9_]+$/),
  description: z.string().max(1000).optional(),
  image_url: z.string().url().optional().or(z.literal('')),
  icon: z.string().optional(),
  color: z.string().optional(),
  price_adjustment: z.number().optional(),
  price_adjustment_type: z.enum(['fixed', 'percentage', 'multiplier']).optional(),
  stock_quantity: z.number().min(0).optional(),
  track_stock: z.boolean().optional(),
  show_conditions: conditionalLogicGroupSchema.optional(),
  sort_order: z.number().optional(),
  is_default: z.boolean().optional(),
  is_disabled: z.boolean().optional(),
});

export const applyCustomizationRequestSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  schema_id: z.string().uuid(),
  selections: z.array(z.object({
    step_id: z.string().uuid(),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  })).min(1, 'En az bir seçim yapmalısınız'),
  quantity: z.number().min(1).default(1),
});

export const calculatePriceRequestSchema = z.object({
  schema_id: z.string().uuid(),
  selections: z.array(z.object({
    step_id: z.string().uuid(),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  })),
});

// =====================================================
// 9. SELECTION VALIDATION (Runtime)
// =====================================================

export const validateSelectionValue = (
  step: { type: CustomizationStepType; validation_rules: any; is_required: boolean },
  value: unknown
): string | null => {
  // Required check
  if (step.is_required) {
    if (value === undefined || value === null || value === '') {
      return 'Bu alan gereklidir';
    }
    if (Array.isArray(value) && value.length === 0) {
      return 'En az bir seçim yapmalısınız';
    }
    if (typeof value === 'boolean' && !value) {
      return 'Bu alanı onaylamalısınız';
    }
  }

  // Skip further validation if value is empty and not required
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return null;
  }

  const rules = step.validation_rules || {};

  // Type-specific validation
  switch (step.type) {
    case 'text':
    case 'textarea': {
      const strValue = String(value);
      if (rules.min_length && strValue.length < rules.min_length) {
        return `En az ${rules.min_length} karakter girmelisiniz`;
      }
      if (rules.max_length && strValue.length > rules.max_length) {
        return `En fazla ${rules.max_length} karakter girebilirsiniz`;
      }
      if (rules.pattern && !new RegExp(rules.pattern).test(strValue)) {
        return rules.custom_error_message || 'Geçersiz format';
      }
      break;
    }

    case 'number': {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        return 'Geçerli bir sayı giriniz';
      }
      if (rules.min_value !== undefined && numValue < rules.min_value) {
        return `En az ${rules.min_value} olmalıdır`;
      }
      if (rules.max_value !== undefined && numValue > rules.max_value) {
        return `En fazla ${rules.max_value} olabilir`;
      }
      break;
    }

    case 'multi_select': {
      const arrValue = value as string[];
      if (rules.min_selections && arrValue.length < rules.min_selections) {
        return `En az ${rules.min_selections} seçim yapmalısınız`;
      }
      if (rules.max_selections && arrValue.length > rules.max_selections) {
        return `En fazla ${rules.max_selections} seçim yapabilirsiniz`;
      }
      break;
    }

    case 'file_upload': {
      const files = value as Array<{ file_size: number; file_type: string }>;
      if (rules.max_file_size) {
        const oversizedFile = files.find(f => f.file_size > rules.max_file_size);
        if (oversizedFile) {
          const maxSizeMB = Math.round(rules.max_file_size / 1024 / 1024 * 10) / 10;
          return `Dosya boyutu ${maxSizeMB}MB\'den büyük olamaz`;
        }
      }
      if (rules.allowed_file_types && rules.allowed_file_types.length > 0) {
        const invalidFile = files.find(f => !rules.allowed_file_types.includes(f.file_type));
        if (invalidFile) {
          return `Sadece ${rules.allowed_file_types.join(', ')} formatları desteklenir`;
        }
      }
      break;
    }
  }

  return null;
};

// =====================================================
// 10. SLUG GENERATION HELPER
// =====================================================

export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Remove consecutive hyphens
};

export const generateKey = (label: string): string => {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100);
};
