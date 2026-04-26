export interface decodedVin {
  year: string;
  make: string;
  model: string;
  trim?: string;
  series?: string;
  bodyClass?: string;
  error?: string;
}

export async function getVehicleByVin(vin: string): Promise<decodedVin> {
  try {
    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
    const data = await response.json();
    const result = data.Results[0];

    if (result.ErrorCode !== "0" && !result.ModelYear) {
      return { year: '', make: '', model: '', error: result.ErrorText };
    }

    return {
      year: result.ModelYear || '',
      make: result.Make || '',
      model: result.Model || '',
      trim: result.Trim || '',
      series: result.Series || '',
      bodyClass: result.BodyClass || '',
    };
  } catch (error) {
    console.error("VIN Decode Error:", error);
    throw error;
  }
}
