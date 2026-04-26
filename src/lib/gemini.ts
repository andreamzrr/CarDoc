import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED'))) {
      console.warn(`Gemini rate limit hit. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export interface DiagnosisResult {
  title: string;
  probability: number;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  estimatedCost: string;
  marketValueImpact?: string;
  ecoImpact?: {
    extraCo2?: string;
    fuelWaste?: string;
    environmentalMessage: string;
  };
  video?: {
    title: string;
    url: string;
  };
}

export interface DIYPart {
  name: string;
  avgPrice: string;
  purchaseUrl?: string;
  retailerName?: string;
  sources?: { retailer: string; price: string; url: string }[];
  ecoLabel?: {
    carbonImpactNew: string;
    carbonImpactReman: string;
    savingsDescription: string;
  };
}

export interface DIYGuide {
  tools: string[];
  parts: DIYPart[];
  estimatedTime: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  steps: string[];
  videos: { title: string; url: string; thumbnail?: string }[];
  disposalAdvice?: string;
  sustainabilityScore?: number;
  safetyProtocol?: string[];
  stepInsights?: string[];
  comparison?: {
    diyTime: string;
    proTime: string;
    diyCost: string;
    proCost: string;
    recommendation: string;
    recommendationScore: number;
  };
}

export interface Mechanic {
  name: string;
  rating: number;
  address: string;
  distance?: string;
  phone?: string;
  specialty?: string;
}

function cleanJSON(text: string) {
  // If the model wrapped the JSON in markdown code blocks, strip them
  const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/```\n?([\s\S]*?)\n?```/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return text.trim();
}

export async function getCarImage(carDetails: string) {
  try {
    const searchPrompt = `Find one high-quality, professional stock photo or press image URL of a 2024 ${carDetails} (or closest year). 
    Return only a JSON object with the "url" of the image. The URL must be a direct link ending in .jpg, .png, or .webp from a reputable source like NetCarShow, CarAndDriver, or official press rooms. Ensure the link is public and accessible.`;

    const searchResponse = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: searchPrompt,
      config: {
        tools: [{ googleSearch: {} }],
        toolConfig: { includeServerSideToolInvocations: true },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            url: { type: Type.STRING }
          },
          required: ["url"]
        }
      }
    }));

    const finalUrl = JSON.parse(cleanJSON(searchResponse.text)).url;
    return finalUrl || null;

  } catch (error) {
    if (error instanceof Error && (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED'))) {
      console.warn("Gemini Quota Exceeded for imaging. Using fallback.");
    } else {
      console.error("Failed to fetch car image:", error);
    }
    return null;
  }
}

export async function getDiagnosis(symptoms: string, carDetails: string, videoBase64?: string, location?: string) {
  try {
    const prompt = `
      MECHANICAL DIAGNOSIS AGENT
      Vehicle: ${carDetails}
      Symptoms: ${symptoms}
      ${location ? `Location: ${location}` : ""}
      ${videoBase64 ? "Audit provided video evidence for auditory and visual anomalies." : ""}

      PRIMARY DIRECTIVE: Use the Google Search tool to identify the absolute top 3 most probable mechanical or electrical failures specifically for this vehicle year/make/model and these symptoms. Look up TSBs, recalls, and forums (Rennlist, etc).

      INSTRUCTIONS:
      1. List the top 3 most probable failures.
      2. Provide concise, data-driven explanations for each.
      3. For each diagnosis, provide a confidence percentage (0-100) in the 'probability' field.
      4. DO NOT use double asterisks (**) or any bold markdown.
      5. If the failure affects component efficiency, include technical estimates in 'ecoImpact'.
      6. If Location is provided, use it to refine 'estimatedCost' based on local labor rates.
      7. For each issue, find one specific YouTube tutorial video title and a confirmed working URL.
      8. Output JSON.
    `;

    const contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];
    if (videoBase64) {
      contents[0].parts.push({
        inlineData: {
          mimeType: "video/webm",
          data: videoBase64
        }
      });
    }

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              probability: { type: Type.NUMBER },
              description: { type: Type.STRING },
              severity: { type: Type.STRING, enum: ['low', 'medium', 'high', 'critical'] },
              estimatedCost: { type: Type.STRING },
              marketValueImpact: { type: Type.STRING },
              ecoImpact: {
                type: Type.OBJECT,
                properties: {
                  extraCo2: { type: Type.STRING },
                  fuelWaste: { type: Type.STRING },
                  environmentalMessage: { type: Type.STRING }
                }
              },
              video: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  url: { type: Type.STRING }
                }
              }
            },
            required: ['title', 'probability', 'description', 'severity', 'estimatedCost'],
          }
        }
      }
    }));

    return JSON.parse(cleanJSON(response.text)) as DiagnosisResult[];
  } catch (error) {
    console.error("Diagnosis failed:", error);
    throw error;
  }
}

export async function getDIYGuide(issueTitle: string, carDetails: string, location?: string) {
  try {
    const prompt = `
      TECHNICAL REPAIR PROCEDURE GENERATION
      Vehicle: ${carDetails}
      Primary Directive: Develop a professional workshop manual for resolving: "${issueTitle}". 
      
      CRITICAL: You MUST prioritize manufacturer service manual specifications (e.g., specific fluid types, torque settings) and owner guide procedures. Use the Google Search tool to find REAL replacement parts (Amazon, AutoZone, RockAuto) and high-quality YouTube tutorial videos specifically for the ${carDetails}${location ? ` in the area near ${location}` : ""}.
      
      Requirements:
      1. Use precise technical language. Identify critical torque specifications or safety hazards.
      2. Bill of materials (parts): Include names, prices, and direct URLs found via search. ${location ? `Prefer sources that can deliver to or are located near ${location}.` : ""}
      3. Inventory of required specialized and standard tools.
      4. Labor duration estimate.
      5. Sequence steps logically using imperative language.
      6. Index 3 highly-viewed, reputable YouTube technical tutorials (e.g. from established repair channels like ChrisFix, Rainman Ray, South Main Auto) with direct watch URLs. Ensure URLs are standard (youtube.com/watch?v=...).
      7. Environmental lifecycle analysis (NEW vs REMANUFACTURED).
      8. Comparison data: providing DIY vs Professional repair comparison (time and total cost estimates), a definitive recommendation on whether to DIY or go to an expert based on difficulty and safety, and a recommendationScore (0-100) indicating the percentage of AI confidence in the suggested route. ${location ? `Refine professional cost estimates based on labor rates near ${location}.` : ""}
      
      IMPORTANT: DO NOT use double asterisks (**) or any bold markdown.
    `;

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tools: { type: Type.ARRAY, items: { type: Type.STRING } },
            parts: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  avgPrice: { type: Type.STRING },
                  purchaseUrl: { type: Type.STRING },
                  retailerName: { type: Type.STRING },
                  sources: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        retailer: { type: Type.STRING },
                        price: { type: Type.STRING },
                        url: { type: Type.STRING }
                      },
                      required: ['retailer', 'price', 'url']
                    }
                  },
                  ecoLabel: {
                    type: Type.OBJECT,
                    properties: {
                      carbonImpactNew: { type: Type.STRING },
                      carbonImpactReman: { type: Type.STRING },
                      savingsDescription: { type: Type.STRING }
                    }
                  }
                },
                required: ['name', 'avgPrice']
              }
            },
            estimatedTime: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'] },
            steps: { type: Type.ARRAY, items: { type: Type.STRING } },
            videos: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  url: { type: Type.STRING }
                },
                required: ['title', 'url']
              }
            },
            disposalAdvice: { type: Type.STRING },
            sustainabilityScore: { type: Type.NUMBER },
            safetyProtocol: { type: Type.ARRAY, items: { type: Type.STRING } },
            stepInsights: { type: Type.ARRAY, items: { type: Type.STRING } },
            comparison: {
              type: Type.OBJECT,
              properties: {
                diyTime: { type: Type.STRING },
                proTime: { type: Type.STRING },
                diyCost: { type: Type.STRING },
                proCost: { type: Type.STRING },
                recommendation: { type: Type.STRING },
                recommendationScore: { type: Type.NUMBER }
              },
              required: ['diyTime', 'proTime', 'diyCost', 'proCost', 'recommendation', 'recommendationScore']
            }
          },
          required: ['tools', 'parts', 'estimatedTime', 'difficulty', 'steps', 'videos', 'comparison']
        }
      }
    }));

    return JSON.parse(cleanJSON(response.text)) as DIYGuide;
  } catch (error) {
    console.error("Failed to generate DIY guide:", error);
    throw error;
  }
}

export interface MaintenanceStep {
  mileage: number;
  tasks: string[];
  importance: 'Essential' | 'Recommended' | 'Optimized';
}

export interface KnownIssue {
  title: string;
  description: string;
  symptoms: string[];
  remedy: string;
}

export async function getMaintenanceTimeline(carDetails: string, year: string, mileage: number) {
  const prompt = `Generate a technical maintenance schedule for a ${year} ${carDetails} with ${mileage} recorded miles. 
  
  CRITICAL: You MUST use the Google Search tool to retrieve the EXACT maintenance schedule from the manufacturer's official Owner's Manual or Service Guide for this specific vehicle model. Do NOT provide generic maintenance steps.

  Justify each service interval based on mechanical wear patterns and component longevity specifications as defined by the manufacturer.
  IMPORTANT: DO NOT use double asterisks (**) or any bold markdown in your response.
  
  Project intervals from current mileage (${mileage}) to 150,000 miles.
  
  For each interval:
  1. Odometer reading
  2. Technical service actions (e.g., "Replace engine lubricant to maintain viscosity and cooling efficiency")
  3. Priority classification (Essential, Recommended, Optimized)
  
  Format as a JSON array of objects.`;

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            mileage: { type: Type.NUMBER },
            tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
            importance: { type: Type.STRING, enum: ['Essential', 'Recommended', 'Optimized'] }
          },
          required: ['mileage', 'tasks', 'importance']
        }
      }
    }
  }));

  return JSON.parse(cleanJSON(response.text)) as MaintenanceStep[];
}

export async function getKnownIssues(carDetails: string, year: string) {
  const prompt = `Identify top 4 historical reliability concerns or common component failures for a ${year} ${carDetails}. 
  
  CRITICAL: Cross-reference findings with manufacturer Technical Service Bulletins (TSBs) and known factory recalls mentioned in owner communities and service documentation.

  Provide technical descriptions of each failure mode.
  IMPORTANT: DO NOT use double asterisks (**) or any bold markdown in your response.
  
  For each issue:
  1. Technical Title
  2. Failure mode description
  3. Diagnostic indicators (e.g., "audible valvetrain rattle", "oxidized fluid traces")
  4. Standard corrective action (remedy).
  
  Format as a JSON array of objects.`;

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            symptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
            remedy: { type: Type.STRING }
          },
          required: ['title', 'description', 'symptoms', 'remedy']
        }
      }
    }
  }));

  return JSON.parse(cleanJSON(response.text)) as KnownIssue[];
}

export async function getNearbyMechanics(location: string, issue: string) {
  try {
    const prompt = `Find 3 highly-rated auto repair shops near ${location} that specialize in: "${issue}". 
    Use the Google Search tool to find their verified names, ratings, full addresses, and phone numbers.
    Format the output as a JSON array of objects.
    IMPORTANT: DO NOT use double asterisks (**) or bold markdown.`;

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              rating: { type: Type.NUMBER },
              address: { type: Type.STRING },
              phone: { type: Type.STRING }
            },
            required: ['name', 'rating', 'address']
          }
        }
      }
    }));

    return JSON.parse(cleanJSON(response.text)) as Mechanic[];
  } catch (error) {
    console.error("Failed to fetch mechanics:", error);
    return [];
  }
}

export async function getNearbyRecyclingCenters(location: string) {
  try {
    const prompt = `Search for 3 Hazardous Waste and Automotive Fluid Recycling Centers near ${location}. 
    Use the Google Search tool to identify their names, addresses, and accepted items (oil, batteries, coolant).
    Format the output as a JSON array of objects.
    IMPORTANT: DO NOT use double asterisks (**) or bold markdown.`;

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              address: { type: Type.STRING },
              acceptedItems: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['name', 'address', 'acceptedItems']
          }
        }
      }
    }));

    return JSON.parse(cleanJSON(response.text)) as { name: string; address: string; acceptedItems: string[] }[];
  } catch (error) {
    console.error("Failed to fetch recycling centers:", error);
    return [];
  }
}

/**
 * AI-powered vehicle canonicalization.
 * Takes informal user input (e.g. "2018 chevy silverado v 8 5.0")
 * and returns a corrected, formal mechanical description (e.g. "2018 Chevrolet Silverado 1500 5.3L V8").
 */
export async function canonicalizeVehicle(input: string) {
  try {
    const prompt = `
      CAR DATA CANONICALIZATION AGENT
      User Input: "${input}"
      
      TASK: Correct any typos, refine model names, and verify engine specs for the described vehicle.
      Example: "2018 chevy silverado v 8 5.0" -> "2018 Chevrolet Silverado 1500 5.3L V8"
      Example: "2015 bm 3series" -> "2015 BMW 3 Series"
      
      Return ONLY a single string of the corrected, formal vehicle year, make, model, and engine spec.
      Do NOT include any extra text, bolding, or markdown.
    `;

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    }));

    return response.text.trim();
  } catch (error) {
    console.error("Vehicle canonicalization failed:", error);
    return input; // Fallback to raw input
  }
}
