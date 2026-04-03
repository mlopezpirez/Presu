import crypto from 'node:crypto'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const TICKET_MODEL = process.env.OPENAI_TICKET_MODEL || 'gpt-5-mini'
const TICKET_REASONING_EFFORT =
  process.env.OPENAI_TICKET_REASONING_EFFORT || 'medium'
const TICKET_IMAGE_DETAIL = process.env.OPENAI_TICKET_IMAGE_DETAIL || 'low'
const TICKET_TIMEOUT_MS = Number(process.env.OPENAI_TICKET_TIMEOUT_MS || 6500)

export default async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonResponse(500, { error: 'OPENAI_API_KEY no configurada.' })
  }

  try {
    const { imageDataUrl, ocrText, sourceFileName } = await request.json()

    const prompt = [
      'Analiza este ticket o factura de compra.',
      'Necesito una salida extremadamente fiel y útil para finanzas personales.',
      'Reglas:',
      '- Identifica comercio, fecha del ticket, total final pagado y una descripción breve.',
      '- Diferencia total real de otros números como serie, ticket, RUT, autorización, caja o terminal.',
      '- Si la fecha no está clara, devuelve occurredOn y ticketDate vacíos.',
      '- category debe ser un solo rubro breve y consistente.',
      '- notes debe resumir el contexto útil del ticket.',
      '- items debe contener líneas de compra útiles si se distinguen, ignorando números de serie.',
      '- No inventes valores.',
      '',
      'Texto OCR preliminar:',
      ocrText || '(sin OCR)',
    ].join('\n')

    const analysis = await analyzeTicketFast({
      imageDataUrl,
      ocrText,
      prompt,
      sourceFileName,
    })

    return jsonResponse(200, analysis)
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'No se pudo analizar el ticket.',
    })
  }
}

function normalizeDate(value) {
  if (!value || typeof value !== 'string') {
    return ''
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    return value
  }

  const latin = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (!latin) {
    return ''
  }

  const day = latin[1].padStart(2, '0')
  const month = latin[2].padStart(2, '0')
  const year = latin[3].length === 2 ? `20${latin[3]}` : latin[3]
  return `${year}-${month}-${day}`
}

async function analyzeTicketFast({ imageDataUrl, ocrText, prompt, sourceFileName }) {
  try {
    const response = await client.responses.create(
      {
        model: TICKET_MODEL,
        reasoning: {
          effort: TICKET_REASONING_EFFORT,
        },
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              { type: 'input_image', image_url: imageDataUrl, detail: TICKET_IMAGE_DETAIL },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'ticket_analysis',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                merchantName: { type: 'string' },
                title: { type: 'string' },
                category: { type: 'string' },
                amount: { type: 'number' },
                occurredOn: { type: 'string' },
                ticketDate: { type: 'string' },
                notes: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      description: { type: 'string' },
                      amount: { type: 'number' },
                    },
                    required: ['description', 'amount'],
                  },
                },
              },
              required: [
                'merchantName',
                'title',
                'category',
                'amount',
                'occurredOn',
                'ticketDate',
                'notes',
                'items',
              ],
            },
          },
        },
      },
      {
        signal: AbortSignal.timeout(TICKET_TIMEOUT_MS),
      },
    )

    const parsed = JSON.parse(response.output_text)
    return buildAnalysisPayload(parsed, sourceFileName)
  } catch (error) {
    return buildOcrFallback(ocrText, sourceFileName, error)
  }
}

function buildAnalysisPayload(parsed, sourceFileName) {
  const normalizedDate = normalizeDate(parsed.ticketDate || parsed.occurredOn)
  const fingerprint = buildFingerprint({
    merchantName: parsed.merchantName || parsed.title || '',
    normalizedDate,
    amount: Number(parsed.amount || 0),
    sourceFileName,
  })

  return {
    merchantName: parsed.merchantName || '',
    title: parsed.title || parsed.merchantName || 'Ticket importado',
    category: parsed.category || 'General',
    amount: Number(parsed.amount || 0),
    occurredOn: normalizedDate || '',
    ticketDate: normalizedDate || '',
    notes: parsed.notes || '',
    items: Array.isArray(parsed.items) ? parsed.items : [],
    fingerprint,
    sourceFileName,
  }
}

function buildOcrFallback(ocrText, sourceFileName, error) {
  const normalizedDate = extractDateFromText(ocrText)
  const merchantName = inferTitle(ocrText)
  const amount = extractAmount(ocrText)
  const fingerprint = buildFingerprint({
    merchantName,
    normalizedDate,
    amount,
    sourceFileName,
  })

  return {
    merchantName,
    title: merchantName || 'Ticket importado',
    category: inferCategory(ocrText),
    amount,
    occurredOn: normalizedDate || '',
    ticketDate: normalizedDate || '',
    notes: buildFallbackNotes(ocrText, error),
    items: [],
    fingerprint,
    sourceFileName,
  }
}

function buildFingerprint({ merchantName, normalizedDate, amount, sourceFileName }) {
  const fingerprintBase = [
    merchantName || '',
    normalizedDate || '',
    Number(amount || 0).toFixed(2),
    sourceFileName || '',
  ].join('|')

  return crypto.createHash('sha256').update(fingerprintBase.toLowerCase()).digest('hex')
}

function extractAmount(text) {
  const normalized = String(text || '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
  const matches = normalized.match(/\d+(?:\.\d{1,2})?/g) ?? []
  const values = matches
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 50 && value < 1000000)

  return values.length > 0 ? Math.max(...values) : 0
}

function inferCategory(text) {
  const lower = String(text || '').toLowerCase()

  if (/(farmashop|farmacia|medic|hospital|ucm)/.test(lower)) {
    return 'Salud'
  }

  if (
    /(disco|tienda inglesa|macro mercado|fresh market|super|merienda|café|almuerzo|helader)/.test(
      lower,
    )
  ) {
    return 'Comidas'
  }

  if (/(ute|ose|adsl|internet|celular|movistar)/.test(lower)) {
    return 'Servicios'
  }

  if (/(patente|estacionamiento|boleto|auto|camioneta|lavado)/.test(lower)) {
    return 'Vehículo'
  }

  if (/(tarjeta|mastercard|visa)/.test(lower)) {
    return 'Tarjetas'
  }

  if (/(bookshop|juguete|libro|ropa|compra)/.test(lower)) {
    return 'Compras'
  }

  return 'General'
}

function inferTitle(text) {
  const firstMeaningfulLine = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 3 && !/^\d+$/.test(line))

  return firstMeaningfulLine?.slice(0, 80) ?? ''
}

function extractDateFromText(text) {
  const candidates = [...String(text || '').matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/g)]

  for (const candidate of candidates) {
    const day = Number(candidate[1])
    const month = Number(candidate[2])
    const year = Number(candidate[3].length === 2 ? `20${candidate[3]}` : candidate[3])

    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2020 || year > 2100) {
      continue
    }

    return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return ''
}

function buildFallbackNotes(ocrText, error) {
  const reason =
    error instanceof Error ? `Lectura rápida por OCR. El modelo no respondió a tiempo: ${error.message}` : 'Lectura rápida por OCR.'

  return [reason, String(ocrText || '').trim().slice(0, 900)].filter(Boolean).join('\n\n')
}

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
