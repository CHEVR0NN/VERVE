// routes/pipeline.js
// GHL CRM pipeline routes — write operations hit the live CRM, so these must
// be management-only. Previously gated by member `authenticate`, which let any
// logged-in member list, create, or move opportunities.
const express  = require('express');
const router   = express.Router();
const { body } = require('express-validator');
const { managementAuthenticate } = require('../middleware/managementAuth');
const {
  listPipelines,
  listOpportunities,
  createOpportunity,
  moveOpportunityStage,
} = require('../controllers/pipelineController');

// Apply management auth to every route mounted on this router.
router.use(managementAuthenticate);

// GET  /api/pipelines
router.get('/', listPipelines);

// GET  /api/pipelines/:pipelineId/opportunities
router.get('/:pipelineId/opportunities', listOpportunities);

// POST /api/pipelines/opportunities
router.post(
  '/opportunities',
  [
    body('pipelineId').notEmpty().withMessage('pipelineId is required'),
    body('pipelineStageId').notEmpty().withMessage('pipelineStageId is required'),
    body('contactId').notEmpty().withMessage('contactId is required'),
    body('name').notEmpty().withMessage('name is required'),
  ],
  createOpportunity
);

// PATCH /api/pipelines/opportunities/:opportunityId/stage
router.patch(
  '/opportunities/:opportunityId/stage',
  [
    body('pipelineStageId').notEmpty().withMessage('pipelineStageId is required'),
  ],
  moveOpportunityStage
);

module.exports = router;
