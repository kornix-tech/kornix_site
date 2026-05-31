export type WaterMetricInputs = {
  soil_field_capacity_water_mm: number | null;
  soil_wilting_point_capacity_water_mm: number | null;
  soil_water_content_mm: number | null;
};

export type WaterThresholdInputs = {
  soil_field_capacity_water_mm: number | null;
  koef_upper_limit: number | null;
  koef_optimum: number | null;
  koef_lower_limit: number | null;
};

export type DerivedWaterMetrics = {
  available_water_content_mm: number | null;
  available_water_fraction_pct: number | null;
};

export type DerivedWaterThresholds = {
  upper_limit_water_mm: number | null;
  optimum_water_mm: number | null;
  lower_limit_water_mm: number | null;
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function deriveWaterMetrics(inputs: WaterMetricInputs): DerivedWaterMetrics {
  const fc = inputs.soil_field_capacity_water_mm;
  const wpc = inputs.soil_wilting_point_capacity_water_mm;
  const swc = inputs.soil_water_content_mm;

  if (!isFiniteNumber(fc) || !isFiniteNumber(wpc) || !isFiniteNumber(swc) || fc <= wpc) {
    return {
      available_water_content_mm: null,
      available_water_fraction_pct: null
    };
  }

  const totalAvailableWaterCapacity = fc - wpc;
  const availableWaterContent = swc - wpc;
  const availableWaterFraction = (100 * availableWaterContent) / totalAvailableWaterCapacity;

  return {
    available_water_content_mm: availableWaterContent,
    available_water_fraction_pct: availableWaterFraction
  };
}

export function deriveWaterThresholds(inputs: WaterThresholdInputs): DerivedWaterThresholds {
  const fc = inputs.soil_field_capacity_water_mm;
  const upper = inputs.koef_upper_limit;
  const optimum = inputs.koef_optimum;
  const lower = inputs.koef_lower_limit;

  if (
    !isFiniteNumber(fc) ||
    !isFiniteNumber(upper) ||
    !isFiniteNumber(optimum) ||
    !isFiniteNumber(lower) ||
    fc <= 0 ||
    lower <= 0 ||
    lower >= optimum ||
    optimum >= upper ||
    upper > 1
  ) {
    return {
      upper_limit_water_mm: null,
      optimum_water_mm: null,
      lower_limit_water_mm: null
    };
  }

  return {
    upper_limit_water_mm: upper * fc,
    optimum_water_mm: optimum * fc,
    lower_limit_water_mm: lower * fc
  };
}
