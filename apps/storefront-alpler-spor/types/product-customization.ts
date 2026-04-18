// =====================================================
// PRODUCT CUSTOMIZATION SYSTEM - TYPESCRIPT TYPES
// Alpler Spor E-commerce Platform
// =====================================================

// =====================================================
// 1. ENUMS
// =====================================================

export type CustomizationStepType =
  | 'select'           // Dropdown
  | 'radio_group'      // Button group (Hayır/Lazer/Harf)
  | 'image_select'     // Görsel kartlar (Paket)
  | 'text'             // Tek satır yazı
  | 'textarea'         // Çok satır yazı
  | 'checkbox'         // Tekli onay kutusu
  | 'multi_select'     // Çoklu seçim
  | 'file_upload'      // Dosya yükleme
  | 'number'           // Sayısal değer
  | 'date'             // Tarih seçici
  | 'color_picker';    // Renk seçici

export type PriceAdjustmentType = 'fixed' | 'percentage' | 'multiplier';

export type GridWidth = 'full' | 'half' | 'third' | 'quarter';
export type ImageAspectRatio = '1:1' | '3:2' | '16:9' | '2:3';
export type ImageFitMode = 'contain' | 'cover';

export type ConditionOperator = 
  | 'equals' 
  | 'not_equals' 
  | 'contains' 
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'is_empty'
  | 'is_not_empty'
  | 'matches_regex';

export type LogicalOperator = 'and' | 'or';

export type ProductionStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

// =====================================================
// 2. CONDITIONAL LOGIC TYPES
// =====================================================

export interface ShowCondition {
  step_key: string;
  operator: ConditionOperator;
  value?: string | number | boolean | string[];
}

export interface ConditionalLogicGroup {
  operator: LogicalOperator;
  conditions: (ShowCondition | ConditionalLogicGroup)[];
}

// =====================================================
// 3. VALIDATION RULES
// =====================================================

export interface ValidationRules {
  min_length?: number;
  max_length?: number;
  pattern?: string;
  min_value?: number;
  max_value?: number;
  min_date?: string;
  max_date?: string;
  allowed_file_types?: string[];
  max_file_size?: number; // bytes
  min_selections?: number;
  max_selections?: number;
  custom_error_message?: string;
}

// =====================================================
// 4. STYLE CONFIG
// =====================================================

export interface StyleConfig {
  label_position?: 'top' | 'left' | 'hidden';
  show_label?: boolean;
  css_class?: string;
  help_text_position?: 'below_label' | 'below_input';
  image_aspect_ratio?: ImageAspectRatio;
  image_fit_mode?: ImageFitMode;
}

// =====================================================
// 5. PRICE CONFIGURATION
// =====================================================

export interface StepOptionPriceConfig {
  value: string;
  price_adjustment: number;
  type: PriceAdjustmentType;
}

export interface StepPriceConfig {
  base_price_adjustment?: number;
  price_per_character?: number;
  options?: StepOptionPriceConfig[];
}

// =====================================================
// 6. BLUEPRINT TYPES (Admin Configuration)
// =====================================================

export interface CustomizationOption {
  id: string;
  step_id: string;
  
  // Option Info
  label: string;
  value: string;
  description?: string;
  
  // Visual
  image_url?: string;
  icon?: string;
  color?: string;
  
  // Pricing
  price_adjustment: number;
  price_adjustment_type: PriceAdjustmentType;
  
  // Stock
  stock_quantity?: number;
  track_stock: boolean;
  
  // Conditional Logic
  show_conditions?: ConditionalLogicGroup;
  
  // Layout
  sort_order: number;
  is_default: boolean;
  is_disabled: boolean;
  
  // Dependencies
  dependent_step_ids?: string[];
  
  // Metadata
  created_at?: string;
  updated_at?: string;
}

export interface CustomizationStep {
  id: string;
  schema_id: string;
  
  // Basic Info
  type: CustomizationStepType;
  key: string;
  label: string;
  placeholder?: string;
  help_text?: string;
  
  // Validation
  is_required: boolean;
  validation_rules: ValidationRules;
  
  // Layout
  sort_order: number;
  grid_width: GridWidth;
  
  // Styling
  style_config: StyleConfig;
  
  // Conditional Logic
  show_conditions?: ConditionalLogicGroup;
  
  // Price Configuration
  price_config?: StepPriceConfig;
  
  // Default Value
  default_value?: string | number | boolean | string[];
  
  // Relations
  options?: CustomizationOption[];
  
  // Metadata
  created_at?: string;
  updated_at?: string;
}

export interface CustomizationSchemaSettings {
  show_summary?: boolean;
  show_price_breakdown?: boolean;
  allow_multiple?: boolean;
  max_selections?: number | null;
  submit_button_text?: string;
  success_message?: string;
}

export interface CustomizationSchema {
  id: string;
  name: string;
  description?: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  
  // Settings
  settings: CustomizationSchemaSettings;
  
  // Relations
  steps?: CustomizationStep[];
  
  // Metadata
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

// =====================================================
// 7. ASSIGNMENT TYPES
// =====================================================

export interface ProductSchemaAssignment {
  id: string;
  schema_id: string;
  product_id: string;
  is_default: boolean;
  sort_order: number;
  created_at?: string;
  
  // Relations
  schema?: CustomizationSchema;
}

export interface CategorySchemaAssignment {
  id: string;
  schema_id: string;
  category_id: string;
  is_auto_apply: boolean;
  created_at?: string;
  
  // Relations
  schema?: CustomizationSchema;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
}

// =====================================================
// 8. RUNTIME TYPES (Customer Selections)
// =====================================================

export interface SelectionValue {
  step_id: string;
  step_key: string;
  step_label: string;
  type: CustomizationStepType;
  value: string | number | boolean | string[];
  display_value: string;
  price_adjustment: number;
}

export interface PriceAdjustment {
  step_key: string;
  step_label: string;
  option_value?: string;
  option_label?: string;
  adjustment_type: PriceAdjustmentType | 'per_character' | 'base';
  character_count?: number;
  adjustment_amount: number;
}

export interface PriceBreakdown {
  base_price: number;
  adjustments: PriceAdjustment[];
  total_adjustment: number;
  final_price: number;
}

export interface UploadedFile {
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

export interface CartItemCustomization {
  id: string;
  cart_item_id: string;
  schema_id: string;
  
  // Data
  schema_snapshot: CustomizationSchema;
  selections: SelectionValue[];
  price_breakdown: PriceBreakdown;
  
  // Content
  custom_text_content?: string;
  uploaded_files: UploadedFile[];
  
  // Metadata
  created_at?: string;
  updated_at?: string;
}

export interface CartCustomizationPayload {
  schema_id: string;
  schema_snapshot: CustomizationSchema;
  selections: SelectionValue[];
  price_breakdown: PriceBreakdown;
  custom_text_content?: string;
  uploaded_files?: UploadedFile[];
}

export interface OrderItemCustomization {
  id: string;
  order_item_id: string;
  schema_id?: string;
  schema_version: number;
  
  // Data (immutable after order)
  schema_snapshot: CustomizationSchema;
  selections: SelectionValue[];
  price_breakdown: PriceBreakdown;
  
  // Content
  custom_text_content?: string;
  uploaded_files: UploadedFile[];
  
  // Production
  production_notes?: string;
  production_status: ProductionStatus;
  
  // Metadata
  created_at?: string;
}

// =====================================================
// 9. FORM BUILDER TYPES (Admin UI)
// =====================================================

export interface FormBuilderState {
  schema: CustomizationSchema;
  steps: CustomizationStep[];
  selectedStepId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: string | null;
  errors: Record<string, string>;
}

export interface StepTemplate {
  type: CustomizationStepType;
  label: string;
  description: string;
  icon: string;
  defaultConfig: Partial<CustomizationStep>;
}

export interface DragItem {
  type: 'STEP_TEMPLATE' | 'EXISTING_STEP';
  id: string;
  index?: number;
  template?: StepTemplate;
}

// =====================================================
// 10. API REQUEST/RESPONSE TYPES
// =====================================================

// Create/Update Schema
export interface CreateSchemaRequest {
  name: string;
  description?: string;
  slug?: string;
  settings?: Partial<CustomizationSchemaSettings>;
}

export interface UpdateSchemaRequest {
  name?: string;
  description?: string;
  is_active?: boolean;
  sort_order?: number;
  settings?: Partial<CustomizationSchemaSettings>;
}

// Create/Update Step
export interface CreateStepRequest {
  type: CustomizationStepType;
  key: string;
  label: string;
  placeholder?: string;
  help_text?: string;
  is_required?: boolean;
  validation_rules?: ValidationRules;
  grid_width?: GridWidth;
  style_config?: StyleConfig;
  show_conditions?: ConditionalLogicGroup;
  price_config?: StepPriceConfig;
  default_value?: string | number | boolean | string[];
  sort_order?: number;
}

// Create/Update Option
export interface CreateOptionRequest {
  label: string;
  value: string;
  description?: string;
  image_url?: string;
  icon?: string;
  color?: string;
  price_adjustment?: number;
  price_adjustment_type?: PriceAdjustmentType;
  stock_quantity?: number;
  track_stock?: boolean;
  show_conditions?: ConditionalLogicGroup;
  sort_order?: number;
  is_default?: boolean;
  is_disabled?: boolean;
}

// Apply Customization to Cart
export interface ApplyCustomizationRequest {
  product_id: string;
  variant_id: string;
  schema_id: string;
  selections: Array<{
    step_id: string;
    value: string | number | boolean | string[];
  }>;
  quantity?: number;
}

export interface ApplyCustomizationResponse {
  cart_item_id: string;
  customization_id: string;
  price_breakdown: PriceBreakdown;
  success: boolean;
  message?: string;
}

// Calculate Price
export interface CalculatePriceRequest {
  schema_id: string;
  selections: Array<{
    step_id: string;
    value: string | number | boolean | string[];
  }>;
}

export interface CalculatePriceResponse {
  price_breakdown: PriceBreakdown;
  success: boolean;
  errors?: Record<string, string>;
}

// =====================================================
// 11. COMPONENT PROP TYPES
// =====================================================

export interface DynamicFormProps {
  schemaId: string;
  productId?: string;
  basePrice: number;
  onChange?: (selections: SelectionValue[], priceBreakdown: PriceBreakdown) => void;
  onSubmit?: (selections: SelectionValue[], priceBreakdown: PriceBreakdown) => void;
  initialValues?: Record<string, unknown>;
  className?: string;
}

export interface FormStepRendererProps {
  step: CustomizationStep;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
  visible?: boolean;
}

export interface StepEditorProps {
  step: CustomizationStep;
  onChange: (step: CustomizationStep) => void;
  onDelete: () => void;
  allSteps: CustomizationStep[];
  errors?: Record<string, string>;
}

export interface ConditionalLogicEditorProps {
  value?: ConditionalLogicGroup;
  onChange: (value: ConditionalLogicGroup | undefined) => void;
  availableSteps: CustomizationStep[];
  currentStepId?: string;
}

export interface PriceSummaryProps {
  basePrice: number;
  priceBreakdown: PriceBreakdown;
  currency?: string;
  showBreakdown?: boolean;
}

// =====================================================
// 12. VALIDATION ERROR TYPES
// =====================================================

export interface StepValidationError {
  step_id: string;
  step_key: string;
  step_label: string;
  error: string;
  error_type: 'required' | 'validation' | 'conditional' | 'stock';
}

export interface FormValidationResult {
  isValid: boolean;
  errors: StepValidationError[];
}

// =====================================================
// 13. UTILITY TYPES
// =====================================================

// Flattened schema for easy access
export type FlattenedSchema = CustomizationSchema & {
  stepsByKey: Record<string, CustomizationStep>;
  optionsByStep: Record<string, CustomizationOption[]>;
};

// Step value types based on step type
export type StepValueType<T extends CustomizationStepType> =
  T extends 'select' | 'text' | 'textarea' | 'date' | 'color_picker' ? string :
  T extends 'radio_group' ? string :
  T extends 'image_select' ? string :
  T extends 'number' ? number :
  T extends 'checkbox' ? boolean :
  T extends 'multi_select' ? string[] :
  T extends 'file_upload' ? UploadedFile[] :
  unknown;

// Selection change event
export interface SelectionChangeEvent {
  stepId: string;
  stepKey: string;
  previousValue: unknown;
  currentValue: unknown;
  affectedSteps: string[]; // Steps whose visibility might have changed
}
