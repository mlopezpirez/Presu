import crypto from 'node:crypto'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const TICKET_MODEL = process.env.OPENAI_TICKET_MODEL || 'gpt-5'
const TICKET_REASONING_EFFORT =
  process.env.OPENAI_TICKET_REASONING_EFFORT || 'medium'
const TICKET_IMAGE_DETAIL = process.env.OPENAI_TICKET_IMAGE_DETAIL || 'high'
const TICKET_TIMEOUT_MS = Number(process.env.OPENAI_TICKET_TIMEOUT_MS || 14000)

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
      '- amount debe ser el total final completo en pesos, no los centavos ni la parte después del punto o coma.',
      '- Diferencia total real de otros números como serie, ticket, RUT, autorización, caja o terminal.',
      '- Si la fecha no está clara, devuelve occurredOn y ticketDate vacíos.',
      '- category debe ser un solo rubro breve y consistente.',
      '- notes debe resumir el contexto útil del ticket.',
      '- items debe contener líneas de compra útiles si se distinguen, ignorando números de serie.',
      '- Si no estás seguro del total final, devuelve amount en 0.',
      '- No inventes valores.',
      '',
      'Texto OCR preliminar:',
      compactOcrText(ocrText),
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
    return buildAnalysisPayload(parsed, sourceFileName, ocrText)
  } catch (error) {
    return buildOcrFallback(ocrText, sourceFileName, error)
  }
}

function buildAnalysisPayload(parsed, sourceFileName, ocrText) {
  const normalizedDate = normalizeDate(parsed.ticketDate || parsed.occurredOn)
  const extractedAmount = extractAmountCandidate(ocrText)
  const amount = normalizeModelAmount(parsed.amount, extractedAmount)
  const fingerprint = buildFingerprint({
    merchantName: parsed.merchantName || parsed.title || '',
    normalizedDate,
    amount,
    sourceFileName,
  })

  return {
    merchantName: parsed.merchantName || '',
    title: parsed.title || parsed.merchantName || 'Ticket importado',
    category: parsed.category || 'General',
    amount,
    occurredOn: normalizedDate || '',
    ticketDate: normalizedDate || '',
    notes: parsed.notes || '',
    analysisSource: 'llm',
    items: Array.isArray(parsed.items) ? parsed.items : [],
    fingerprint,
    sourceFileName,
  }
}

function buildOcrFallback(ocrText, sourceFileName, error) {
  const normalizedDate = extractDateFromText(ocrText)
  const merchantName = inferTitle(ocrText)
  const extractedAmount = extractAmountCandidate(ocrText)
  const amount = extractedAmount.isReliable ? extractedAmount.amount : 0
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
    notes: '',
    analysisSource: 'ocr_fallback',
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
  return extractAmountCandidate(text).amount
}

function normalizeModelAmount(modelAmount, extracted) {
  const numericModelAmount = Number(modelAmount || 0)
  if (!Number.isFinite(numericModelAmount) || numericModelAmount <= 0) {
    return extracted.isReliable ? extracted.amount : 0
  }

  if (shouldReplaceModelAmount(numericModelAmount, extracted)) {
    return extracted.amount
  }

  return Math.round(numericModelAmount)
}

function shouldReplaceModelAmount(modelAmount, extracted) {
  if (!extracted.isReliable || !extracted.amount || extracted.amount <= 0) {
    return false
  }

  if (modelAmount <= 0) {
    return true
  }

  if (modelAmount < extracted.amount / 10) {
    return true
  }

  if (modelAmount < 100 && extracted.amount >= 1000) {
    return true
  }

  return false
}

function extractAmountCandidate(text) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let best = { amount: 0, score: Number.NEGATIVE_INFINITY, line: '' }

  for (const [index, line] of lines.entries()) {
    const candidates = line.match(/\d[\d., ]*\d|\d/g) ?? []

    for (const candidate of candidates) {
      const amount = parseLocalizedAmount(candidate)
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
        continue
      }

      const score = scoreAmountCandidate(line, amount, index)
      if (score > best.score || (score === best.score && amount > best.amount)) {
        best = { amount, score, line }
      }
    }
  }

  const hasTotalSignal = /(total|importe|a pagar|saldo|total \$|total:|total uyu|total pagado)/.test(
    best.line.toLowerCase(),
  )
  const isReliable = best.amount > 0 && (hasTotalSignal || best.score >= 80)

  return {
    amount: best.amount > 0 ? best.amount : 0,
    isReliable,
  }
}

function parseLocalizedAmount(raw) {
  const value = String(raw || '').replace(/\s+/g, '').trim()
  if (!value) {
    return 0
  }

  const hasComma = value.includes(',')
  const hasDot = value.includes('.')
  let normalized = value

  if (hasComma && hasDot) {
    const decimalSeparator = value.lastIndexOf(',') > value.lastIndexOf('.') ? ',' : '.'
    if (decimalSeparator === ',') {
      normalized = value.replace(/\./g, '').replace(',', '.')
    } else {
      normalized = value.replace(/,/g, '')
    }
  } else if (hasComma) {
    normalized = /,\d{2}$/.test(value) ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '')
  } else if (hasDot) {
    if (/\.\d{2}$/.test(value) && (value.match(/\./g)?.length ?? 0) === 1) {
      normalized = value
    } else {
      normalized = value.replace(/\./g, '')
    }
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.round(parsed)
}

function scoreAmountCandidate(line, amount, index) {
  const lower = String(line || '').toLowerCase()
  let score = amount / 1000

  if (/(total|importe|a pagar|total \$|total:|saldo|efectivo|tarjeta)/.test(lower)) {
    score += 100
  }

  if (/(subtotal)/.test(lower)) {
    score += 30
  }

  if (/(iva|descuento|recargo)/.test(lower)) {
    score -= 20
  }

  if (/\bx\b|\d+\s*x\s*\d+/.test(lower)) {
    score -= 45
  }

  if (/^\d+\//.test(lower)) {
    score -= 20
  }

  if (/(rut|r\.u\.t|autoriz|caja|serie|factura|ticket nro|comprobante|cliente|terminal|lote)/.test(lower)) {
    score -= 60
  }

  score += index * 0.5
  return score
}

function compactOcrText(text) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.length > 1)
    .slice(0, 80)

  return lines.join('\n') || '(sin OCR)'
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

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
