import { GoogleGenAI, Type } from "@google/genai";

let ai: GoogleGenAI | null = null;

export function getGeminiAI() {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
}

export async function extractVisitFromPDF(base64Pdf: string) {
  const genAI = getGeminiAI();
  
  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        inlineData: {
          mimeType: "application/pdf",
          data: base64Pdf,
        }
      },
      "Extrae los detalles de la visita de este documento. Devuelve un objeto JSON que coincida con el esquema solicitado. Si algún campo no está presente en el documento, déjalo vacío o usa un valor por defecto razonable."
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          establecimiento: { type: Type.STRING, description: "Nombre del establecimiento o escuela visitada" },
          fecha: { type: Type.STRING, description: "Fecha de la visita en formato YYYY-MM-DD" },
          tipoContacto: { type: Type.STRING, description: "Modalidad de la visita: 'Presencial' o 'Online'" },
          motivo: { type: Type.STRING, description: "Motivo principal de la visita" },
          motivoOtro: { type: Type.STRING, description: "Si el motivo es 'Otro', especifique cuál" },
          estamento: { type: Type.STRING, description: "Estamento con el que se reunió (ej. Equipo Directivo, Docentes, etc.)" },
          estamentoOtro: { type: Type.STRING, description: "Si el estamento es 'Otros', especifique cuál" },
          descripcion: { type: Type.STRING, description: "Descripción general o resumen de la visita" },
          anexos: { type: Type.STRING, description: "Listado de anexos o adjuntos al acta" },
          participantes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                nombre: { type: Type.STRING },
                cargo: { type: Type.STRING }
              }
            }
          },
          acuerdosSostenedor: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                descripcion: { type: Type.STRING },
                plazo: { type: Type.STRING },
                responsables: { type: Type.STRING },
                fechaRevision: { type: Type.STRING }
              }
            }
          },
          acuerdosEquipo: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                descripcion: { type: Type.STRING },
                plazo: { type: Type.STRING },
                responsables: { type: Type.STRING },
                fechaRevision: { type: Type.STRING }
              }
            }
          }
        }
      }
    }
  });

  if (!response.text) {
    throw new Error("No se pudo extraer información del PDF.");
  }

  return JSON.parse(response.text);
}
