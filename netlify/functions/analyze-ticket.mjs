import crypto from 'node:crypto'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const TICKET_MODEL = process.env.OPENAI_TICKET_MODEL || 'gpt-5'
const TICKET_REASONING_EFFORT =
  process.env.OPENAI_TICKET_REASONING_EFFORT || 'high'

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

    const response = await client.responses.create({
      model: TICKET_MODEL,
      reasoning: {
        effort: TICKET_REASONING_EFFORT,
      },
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: imageDataUrl, detail: 'high' },
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
    })

    const parsed = JSON.parse(response.output_text)
    const normalizedDate = normalizeDate(parsed.ticketDate || parsed.occurredOn)
    const fingerprintBase = [
      parsed.merchantName || parsed.title || '',
      normalizedDate || '',
      Number(parsed.amount || 0).toFixed(2),
      sourceFileName || '',
    ].join('|')

    const fingerprint = crypto
      .createHash('sha256')
      .update(fingerprintBase.toLowerCase())
      .digest('hex')

    return jsonResponse(200, {
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
    })
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

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
