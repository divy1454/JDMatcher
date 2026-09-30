import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authGuard, requireRole } from '../middleware/authGuard.js';
import { InvoiceService } from '../services/invoiceService.js';

const generateInvoiceSchema = z.object({
  organizationId: z.string().uuid(),
  billingMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be in YYYY-MM format (e.g. 2026-09)'),
  exchangeRateInr: z.number().positive().optional(),
  customSubtotalUsd: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  dueDateDays: z.number().int().positive().optional(),
});

const toggleGenerationSchema = z.object({
  isGenerated: z.boolean(),
});

const updateStatusSchema = z.object({
  status: z.enum(['draft', 'pending', 'generated', 'paid', 'overdue', 'void']),
});

export async function invoicesRoutes(fastify: FastifyInstance) {
  // 1. GET /api/invoices/my-expenses (Org Admin: view monthly expense tracking)
  fastify.get(
    '/my-expenses',
    { preHandler: [authGuard, requireRole(['org_admin'])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      if (!user.organizationId) {
        return reply.status(400).send({ error: 'NO_ORG', message: 'User is not associated with an organization' });
      }

      try {
        const expenses = await InvoiceService.getAgencyMonthlyExpenses(user.organizationId);
        return reply.send(expenses);
      } catch (err: any) {
        request.log.error(err, 'Failed to fetch monthly expenses');
        return reply.status(500).send({ error: 'SERVER_ERROR', message: err.message || 'Failed to fetch monthly expenses' });
      }
    }
  );

  // 2. GET /api/invoices/:id (Org Admin or Super Admin: view real-life business invoice with UPI QR details)
  fastify.get(
    '/:id',
    { preHandler: [authGuard, requireRole(['org_admin', 'super_admin'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;
      const isSuperAdmin = user.role === 'super_admin';

      try {
        const invoiceDetails = await InvoiceService.getInvoiceDetails(id, {
          organizationId: user.organizationId || undefined,
          isSuperAdmin,
        });
        return reply.send(invoiceDetails);
      } catch (err: any) {
        request.log.error(err, `Failed to retrieve invoice ${id}`);
        if (err.message === 'Invoice not found') {
          return reply.status(404).send({ error: 'NOT_FOUND', message: 'Invoice not found' });
        }
        if (err.message.includes('Unauthorized') || err.message.includes('not been issued')) {
          return reply.status(403).send({ error: 'FORBIDDEN', message: err.message });
        }
        return reply.status(500).send({ error: 'SERVER_ERROR', message: err.message });
      }
    }
  );

  // 3. GET /api/invoices/admin/all (Super Admin: list all invoices across all agencies)
  fastify.get(
    '/admin/all',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request, reply) => {
      try {
        const query = request.query as { organizationId?: string; status?: string; billingMonth?: string };
        const invoices = await InvoiceService.listAllInvoices(query);
        return reply.send(invoices);
      } catch (err: any) {
        request.log.error(err, 'Failed to list invoices for admin');
        return reply.status(500).send({ error: 'SERVER_ERROR', message: err.message });
      }
    }
  );

  // 3b. GET /api/invoices/admin/agency-consumption (Super Admin: get exact agency consumption & live online USD to INR rate)
  fastify.get(
    '/admin/agency-consumption',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { organizationId?: string; billingMonth?: string };
      if (!query.organizationId || !query.billingMonth) {
        return reply.status(400).send({ error: 'INVALID_QUERY', message: 'organizationId and billingMonth are required' });
      }

      try {
        const consumption = await InvoiceService.getAgencyMonthConsumption(query.organizationId, query.billingMonth);
        return reply.send(consumption);
      } catch (err: any) {
        request.log.error(err, 'Failed to fetch agency consumption');
        return reply.status(500).send({ error: 'SERVER_ERROR', message: err.message });
      }
    }
  );

  // 4. POST /api/invoices/admin/generate (Super Admin: generate/issue bill for an agency month)
  fastify.post(
    '/admin/generate',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = generateInvoiceSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      const user = request.user!;
      try {
        const invoice = await InvoiceService.generateInvoice({
          organizationId: parseResult.data.organizationId,
          billingMonth: parseResult.data.billingMonth,
          superAdminEmail: user.email,
          exchangeRateInr: parseResult.data.exchangeRateInr,
          customSubtotalUsd: parseResult.data.customSubtotalUsd,
          notes: parseResult.data.notes,
          dueDateDays: parseResult.data.dueDateDays,
        });

        return reply.status(201).send({
          message: 'Invoice successfully generated and published for agency',
          invoice,
        });
      } catch (err: any) {
        request.log.error(err, 'Failed to generate invoice');
        return reply.status(500).send({ error: 'SERVER_ERROR', message: err.message });
      }
    }
  );

  // 5. PATCH /api/invoices/admin/:id/toggle-generation (Super Admin: enable/disable agency invoice download)
  fastify.patch(
    '/admin/:id/toggle-generation',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = toggleGenerationSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      const user = request.user!;
      try {
        const updated = await InvoiceService.toggleGeneration(id, parseResult.data.isGenerated, user.email);
        return reply.send({
          message: parseResult.data.isGenerated
            ? 'Bill generation activated: Agency can now download this invoice'
            : 'Bill generation deactivated: Agency invoice download hidden',
          invoice: updated,
        });
      } catch (err: any) {
        request.log.error(err, `Failed to toggle invoice generation for ${id}`);
        return reply.status(500).send({ error: 'SERVER_ERROR', message: err.message });
      }
    }
  );

  // 6. PATCH /api/invoices/admin/:id/status (Super Admin: mark as paid/pending/void)
  fastify.patch(
    '/admin/:id/status',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateStatusSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      try {
        const updated = await InvoiceService.updateStatus(id, parseResult.data.status);
        return reply.send({
          message: `Invoice status updated to ${parseResult.data.status}`,
          invoice: updated,
        });
      } catch (err: any) {
        request.log.error(err, `Failed to update invoice status for ${id}`);
        return reply.status(500).send({ error: 'SERVER_ERROR', message: err.message });
      }
    }
  );
}
